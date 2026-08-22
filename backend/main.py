import os
import uuid
import datetime
from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

# Import backend modules
from backend import models, schemas, crud, analyzer
from backend.database import engine, SessionLocal, get_db

# Create database tables if they do not exist
from sqlalchemy import inspect
inspector = inspect(engine)
if inspector.has_table("complaints"):
    columns = [col["name"] for col in inspector.get_columns("complaints")]
    if "category" not in columns or "evidence_source" not in columns:
        engine.dispose()
        from backend.database import DB_DIR
        db_path = os.path.join(DB_DIR, 'foodguard.db')
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
                print("Deleted stale SQLite database to apply new schema columns (category, evidence_source, etc.).")
            except Exception as e:
                print(f"Error removing old DB file: {e}")

models.Base.metadata.create_all(bind=engine)

# Seed database with mock orders and complaints
db = SessionLocal()
try:
    crud.seed_db(db)
finally:
    db.close()

# Create FastAPI app
app = FastAPI(
    title="FoodGuard AI API",
    description="Backend API for food delivery refund fraud detection system",
    version="1.0.0"
)

# Add CORS Middleware to allow requests from any local origin (e.g., if index.html is opened directly)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure the uploads directory exists
if os.environ.get("VERCEL"):
    UPLOAD_DIR = "/tmp/uploads"
else:
    UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Mount the uploads directory to serve images at /uploads
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# --- API Endpoints ---

@app.get("/api/orders", response_model=list[schemas.OrderResponse])
def read_orders(db: Session = Depends(get_db)):
    """Retrieve all available orders in the system (for testing & dropdown auto-fill)."""
    return crud.get_all_orders(db)


@app.post("/api/complaints", response_model=schemas.ComplaintResponse)
async def submit_complaint(
    order_id: str = Form(...),
    customer_id: str = Form(...),
    customer_name: str = Form(...),
    restaurant_name: str = Form(...),
    complaint_text: str = Form(...),
    category: str = Form("Other"),
    evidence_source: str = Form("upload"),
    image: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Endpoint to upload and analyze a complaint.
    Extracts file contents, calculates the risk score, saves to SQLite, and returns results.
    """
    # 1. Read file bytes
    try:
        file_content = await image.read()
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read uploaded image file.")

    # Idempotency: prevent double-submission for the same order ID
    existing_claim = db.query(models.Complaint).filter(models.Complaint.order_id == order_id).first()
    if existing_claim:
        raise HTTPException(status_code=400, detail="A claim has already been filed for this order ID.")

    # Validate customer_id matches order customer_id if order exists
    order = crud.get_order(db, order_id)
    if order and order.customer_id != customer_id:
        raise HTTPException(status_code=400, detail="Customer ID does not match the order records.")

    # Secure Image Validation
    # A. Validate File Size (Max 5MB)
    max_size = 5 * 1024 * 1024
    if len(file_content) > max_size:
        raise HTTPException(status_code=400, detail="File size exceeds the maximum limit of 5MB.")

    # B. Validate File Extension (Whitelist only)
    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp"}
    file_extension = os.path.splitext(image.filename)[1].lower()
    if file_extension not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Unsupported file extension. Only JPG, JPEG, PNG, and WEBP are allowed.")

    # C. Validate MIME Type
    allowed_mimes = {"image/jpeg", "image/png", "image/webp"}
    if image.content_type not in allowed_mimes:
        raise HTTPException(status_code=400, detail="Invalid MIME type. Upload must be a valid image file.")

    # D. Validate Actual Image Content & Dimensions using PIL
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(file_content))
        img.verify()  # verify integrity
        img = Image.open(io.BytesIO(file_content))
        width, height = img.size
        if width < 10 or height < 10:
            raise HTTPException(status_code=400, detail="Image dimensions are too small (minimum 10x10).")
    except Exception:
        raise HTTPException(status_code=400, detail="Malformed or corrupted image content. Upload is not a valid image.")

    # 2. Analyze complaint using the risk analysis engine
    analysis = analyzer.analyze_complaint(
        db=db,
        filename=image.filename,
        file_content=file_content,
        customer_name=customer_name,
        restaurant_name=restaurant_name,
        complaint_text=complaint_text,
        order_id=order_id,
        customer_id=customer_id,
        category=category,
        evidence_source=evidence_source
    )

    # 3. Save the image file to the uploads/ directory
    # Generate a unique filename using UUID and forced lowercase extension to prevent path traversal/collision/execution
    unique_filename = f"{uuid.uuid4().hex}{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    with open(file_path, "wb") as f:
        f.write(file_content)

    # Relative path to store in database (to be served via /uploads/{filename})
    db_image_path = f"uploads/{unique_filename}"

    # 4. Save complaint record in the database
    new_complaint = crud.create_complaint(
        db=db,
        order_id=order_id,
        customer_id=customer_id,
        customer_name=customer_name,
        restaurant_name=restaurant_name,
        complaint_text=complaint_text,
        image_path=db_image_path,
        image_hash=analysis["image_hash"],
        risk_score=analysis["risk_score"],
        decision=analysis["decision"],
        category=category,
        risk_level=analysis["risk_level"],
        recommendation=analysis["recommendation"],
        evidence_source=evidence_source,
        analysis_details={
            "rules": analysis["rules_triggered"],
            "metadata": analysis["image_metadata"],
            "duplicate_detection": analysis.get("duplicate_detection"),
            "customer_history": analysis.get("customer_history"),
            "breakdown": analysis.get("breakdown")
        }
    )

    return new_complaint


@app.get("/api/complaints", response_model=list[schemas.ComplaintResponse])
def get_complaints(db: Session = Depends(get_db)):
    """Retrieve all submitted complaints (for the Admin Dashboard)."""
    return crud.get_all_complaints(db)


@app.put("/api/complaints/{complaint_id}/status", response_model=schemas.ComplaintResponse)
def update_status(complaint_id: int, status_update: dict, db: Session = Depends(get_db)):
    """Update status of a complaint (e.g. Approve, Reject, Needs Evidence)."""
    new_status = status_update.get("status")
    if new_status not in ["Pending", "Approved", "Rejected", "Needs Evidence"]:
        raise HTTPException(status_code=400, detail="Invalid status value.")
        
    complaint = crud.update_complaint_status(db, complaint_id, new_status)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found.")
    return complaint


@app.get("/api/dashboard/stats", response_model=schemas.DashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Compute aggregate counts and statistics for the admin dashboard."""
    complaints = crud.get_all_complaints(db)
    
    total = len(complaints)
    genuine = sum(1 for c in complaints if c.decision == "Likely Genuine")
    review = sum(1 for c in complaints if c.decision == "Manual Review Needed")
    suspicious = sum(1 for c in complaints if c.decision == "Suspicious")
    
    pending = sum(1 for c in complaints if c.status == "Pending")
    approved = sum(1 for c in complaints if c.status == "Approved")
    rejected = sum(1 for c in complaints if c.status == "Rejected")
    needs_evidence = sum(1 for c in complaints if c.status == "Needs Evidence")
    
    return schemas.DashboardStats(
        total_complaints=total,
        genuine_count=genuine,
        review_count=review,
        suspicious_count=suspicious,
        pending_count=pending,
        approved_count=approved,
        rejected_count=rejected,
        needs_evidence_count=needs_evidence,
        recent_complaints=complaints[:10]  # Return last 10 complaints
    )


@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    """Health check endpoint to verify backend process and database connectivity."""
    try:
        # Verify database read is operational
        db.execute("SELECT 1")
        db_status = "healthy"
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    return {
        "status": "healthy",
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "database": db_status
    }


# --- Mount Frontend Single Page App ---
# We mount this at the very end so that it serves as a fallback.
# Any route not matching /api/... or /uploads/... will serve files from the frontend/ folder.
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
