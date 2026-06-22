import datetime
from sqlalchemy.orm import Session
from backend import models

def get_order(db: Session, order_id: str):
    """Retrieve an order by its ID."""
    return db.query(models.Order).filter(models.Order.id == order_id).first()

def get_all_orders(db: Session):
    """Retrieve all orders in the database."""
    return db.query(models.Order).all()

def get_complaint_by_hash(db: Session, image_hash: str):
    """Find if an image with this SHA-256 hash has been uploaded before."""
    return db.query(models.Complaint).filter(models.Complaint.image_hash == image_hash).first()

def get_customer_complaint_count(db: Session, customer_id: str):
    """Count how many previous complaints a customer has filed."""
    return db.query(models.Complaint).filter(models.Complaint.customer_id == customer_id).count()

def get_restaurant_similar_complaints_count(db: Session, restaurant_name: str, keyword: str):
    """
    Count how many complaints exist for this restaurant containing a similar keyword.
    Keyword could be "hair", "insect", "lizard", "plastic", "hygiene", etc.
    """
    # Use simple case-insensitive database string matching
    query_pattern = f"%{keyword}%"
    return db.query(models.Complaint).filter(
        models.Complaint.restaurant_name.ilike(restaurant_name),
        models.Complaint.complaint_text.ilike(query_pattern)
    ).count()

def create_complaint(db: Session, order_id: str, customer_id: str, customer_name: str, restaurant_name: str, 
                     complaint_text: str, image_path: str, image_hash: str, 
                     risk_score: int, decision: str, analysis_details: dict):
    """Create a new complaint record."""
    db_complaint = models.Complaint(
        order_id=order_id,
        customer_id=customer_id,
        customer_name=customer_name,
        restaurant_name=restaurant_name,
        complaint_text=complaint_text,
        image_path=image_path,
        image_hash=image_hash,
        risk_score=risk_score,
        decision=decision,
        analysis_details=analysis_details,
        status="Pending"
    )
    db.add(db_complaint)
    db.commit()
    db.refresh(db_complaint)
    return db_complaint

def get_all_complaints(db: Session):
    """Retrieve all complaints, ordered by creation date descending."""
    return db.query(models.Complaint).order_by(models.Complaint.created_at.desc()).all()

def update_complaint_status(db: Session, complaint_id: int, status: str):
    """Update the verification status of a complaint (e.g., Approved, Rejected, Pending)."""
    db_complaint = db.query(models.Complaint).filter(models.Complaint.id == complaint_id).first()
    if db_complaint:
        db_complaint.status = status
        db.commit()
        db.refresh(db_complaint)
    return db_complaint

def seed_db(db: Session):
    """
    Seeds the SQLite database with mock orders and complaints
    to demonstrate and test different risk-scoring rules.
    """
    # Check if database is already seeded
    if db.query(models.Order).count() > 0:
        return

    now = datetime.datetime.utcnow()

    # Define mock orders
    # 1. Fresh delivery (15 mins ago)
    order1 = models.Order(
        id="ORD-1001",
        customer_id="CUST-1001",
        customer_name="Alice Smith",
        restaurant_name="Burger House",
        delivered_at=now - datetime.timedelta(minutes=15)
    )
    # 2. Delayed delivery (3 days ago)
    order2 = models.Order(
        id="ORD-1002",
        customer_id="CUST-1002",
        customer_name="Bob Jones",
        restaurant_name="Sushi Central",
        delivered_at=now - datetime.timedelta(days=3)
    )
    # 3. Clean standard delivery (2 hours ago)
    order3 = models.Order(
        id="ORD-1003",
        customer_id="CUST-1003",
        customer_name="Charlie Brown",
        restaurant_name="Pizza Palace",
        delivered_at=now - datetime.timedelta(hours=2)
    )
    # 4. Another order for Alice (5 hours ago)
    order4 = models.Order(
        id="ORD-1004",
        customer_id="CUST-1001",
        customer_name="Alice Smith",
        restaurant_name="Pizza Palace",
        delivered_at=now - datetime.timedelta(hours=5)
    )
    # 5. Distinct Alice Smith order (6 hours ago)
    order5 = models.Order(
        id="ORD-1005",
        customer_id="CUST-1006",
        customer_name="Alice Smith",
        restaurant_name="Sushi Central",
        delivered_at=now - datetime.timedelta(hours=6)
    )

    db.add_all([order1, order2, order3, order4, order5])
    db.commit()

    # Pre-seed some complaints to test historical rules
    # We will use mock details and dummy image hashes
    
    # Pre-seed 2 complaints for "Alice Smith" (CUST-1001) so her next one triggers "Many claims" (> 2 previous)
    c1 = models.Complaint(
        order_id="ORD-0990",
        customer_id="CUST-1001",
        customer_name="Alice Smith",
        restaurant_name="Taco Bell",
        complaint_text="Found a hair in my taco. This is unacceptable.",
        image_path="uploads/mock_hair_1.png",
        image_hash="dummy_hash_alice_1",
        risk_score=20,
        decision="Likely Genuine",
        status="Approved",
        analysis_details={
            "rules": [
                {"name": "Filename check", "passed": True, "score_added": 0, "message": "Clear filename"},
                {"name": "Metadata check", "passed": True, "score_added": 0, "message": "EXIF camera metadata present"}
            ],
            "final_score": 20
        },
        created_at=now - datetime.timedelta(days=10)
    )

    c2 = models.Complaint(
        order_id="ORD-0995",
        customer_id="CUST-1001",
        customer_name="Alice Smith",
        restaurant_name="Burger House",
        complaint_text="There was a piece of plastic wrapper in the bun.",
        image_path="uploads/mock_plastic_1.png",
        image_hash="dummy_hash_alice_2",
        risk_score=40,
        decision="Manual Review Needed",
        status="Approved",
        analysis_details={
            "rules": [
                {"name": "Filename check", "passed": True, "score_added": 0, "message": "Clear filename"},
                {"name": "Metadata check", "passed": False, "score_added": 15, "message": "No EXIF metadata found"},
                {"name": "Upload delay check", "passed": False, "score_added": 20, "message": "Submitted 28 hours after delivery"}
            ],
            "final_score": 40
        },
        created_at=now - datetime.timedelta(days=5)
    )

    # Pre-seed complaints for "Burger House" containing the word "hair"
    # This will trigger the "Restaurant has similar complaints" mitigating factor (reduces risk for customer)
    c3 = models.Complaint(
        order_id="ORD-0901",
        customer_id="CUST-1004",
        customer_name="Donald Duck",
        restaurant_name="Burger House",
        complaint_text="Disgusting! Found a black hair inside my chicken burger.",
        image_path="uploads/mock_hair_2.png",
        image_hash="dummy_hash_restaurant_1",
        risk_score=15,
        decision="Likely Genuine",
        status="Approved",
        analysis_details={
            "rules": [
                {"name": "Filename check", "passed": True, "score_added": 0, "message": "Clear filename"}
            ],
            "final_score": 15
        },
        created_at=now - datetime.timedelta(days=20)
    )

    c4 = models.Complaint(
        order_id="ORD-0902",
        customer_id="CUST-1005",
        customer_name="Mickey Mouse",
        restaurant_name="Burger House",
        complaint_text="Found long strands of hair stuck to the cheese slice.",
        image_path="uploads/mock_hair_3.png",
        image_hash="dummy_hash_restaurant_2",
        risk_score=10,
        decision="Likely Genuine",
        status="Approved",
        analysis_details={
            "rules": [
                {"name": "Filename check", "passed": True, "score_added": 0, "message": "Clear filename"}
            ],
            "final_score": 10
        },
        created_at=now - datetime.timedelta(days=18)
    )

    db.add_all([c1, c2, c3, c4])
    db.commit()
