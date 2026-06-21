# OrderProof 🛡️
### Food Delivery Refund Fraud Detection System

OrderProof is a beginner-friendly full-stack application built to identify suspicious customer refund requests. When customers claim contamination issues (like hair, insects, plastic, or unhygienic substances), OrderProof evaluates multiple signal metrics to determine whether the claim is **Likely Genuine** (0–30%), needs **Manual Review** (31–70%), or is **Suspicious** (71–100%).

---

## Project Structure
Here is the clean folder structure designed for local development:
```text
OrderProof/
├── backend/
│   ├── main.py              # FastAPI app setup, routing, and static file serving
│   ├── database.py          # SQLite database connection & setup
│   ├── models.py            # SQLAlchemy database tables
│   ├── schemas.py           # Pydantic schemas for API serialization
│   ├── crud.py              # DB query handlers and test-data seeder
│   ├── analyzer.py          # Core multi-signal risk-scoring engine
│   └── requirements.txt     # Python backend dependencies
├── frontend/
│   ├── index.html           # SPA Dashboard HTML structure
│   ├── style.css            # Glassmorphism dark mode custom stylesheet
│   └── app.js               # Frontend router, validation, and APIs
├── database/
│   └── foodguard.db         # Auto-generated SQLite Database file
├── uploads/                 # Storage folder for uploaded evidence images
└── README.md                # This setup & runner guide
```

---

## File-by-File Explanation

### Backend
1. **[database.py](file:///Users/darshith/OrderProof/backend/database.py)**: Sets up the connection to the SQLite database `database/foodguard.db` using SQLAlchemy ORM. It manages connection pooling and provides a session helper (`get_db`) for requests.
2. **[models.py](file:///Users/darshith/OrderProof/backend/models.py)**: Defines the SQLAlchemy database tables. We have an `Order` model (to track customer delivery timing) and a `Complaint` model (storing the upload text, image file path, SHA-256 hash, calculated risk score, status, and JSON analysis breakdown).
3. **[schemas.py](file:///Users/darshith/OrderProof/backend/schemas.py)**: Contains Pydantic models for data validation and response formatting. This ensures our API returns consistent JSON.
4. **[crud.py](file:///Users/darshith/OrderProof/backend/crud.py)**: Handles database queries. On startup, it checks if the database is empty and automatically inserts a **mock sandbox dataset** containing pre-made orders and historic complaints. This lets you immediately test all scoring rules.
5. **[analyzer.py](file:///Users/darshith/OrderProof/backend/analyzer.py)**: The core **Risk-Scoring Engine**. It evaluates 7 rules, assigning or mitigating points:
   * **AI Filename Check (+25 pts)**: Filename contains keywords like `chatgpt`, `dalle`, etc.
   * **EXIF Metadata Check (+15 pts)**: Inspects image metadata. Normal camera shots have EXIF; screenshots or downloads do not.
   * **Resolution Check (+5 pts)**: Flag if size is too low (<400px, common web crop).
   * **Duplicate Image Hash Check (+30 pts)**: Scans SHA-256 hashes of past uploads to block image recycling.
   * **Complaint Timing Check (+20 pts)**: Flagged if submitted > 24 hours after delivery.
   * **Claims Volume Check (+20 pts)**: Flagged if the customer has $\ge 3$ complaints.
   * **Restaurant Coherence Check (-15 pts Mitigating Factor)**: Reduces risk if other customers previously reported the same issue keyword (e.g. "hair") at this restaurant.
   * **Bait Word Check (+10 pts)**: Complaint text contains terms like `refund`, `sue`, `money back`.
6. **[main.py](file:///Users/darshith/OrderProof/backend/main.py)**: The API controller. Sets up endpoints (`GET /api/orders`, `POST /api/complaints`, `GET /api/complaints`, `PUT /api/complaints/{id}/status`), mounts the `uploads/` folder, and mounts the `frontend/` folder at `/` to serve the web application.

### Frontend
1. **[index.html](file:///Users/darshith/OrderProof/frontend/index.html)**: The Single-Page Application skeleton. Includes view frames (Overview Dashboard, Complaint Upload Form, Results Screen, and Admin Panel). It loads Lucide vector icons and Google Fonts.
2. **[style.css](file:///Users/darshith/OrderProof/frontend/style.css)**: Custom responsive styles utilizing modern glassmorphism (translucent cards, blur backdrops, gradient buttons, custom animations, active state highlights, SVG progress ring).
3. **[app.js](file:///Users/darshith/OrderProof/frontend/app.js)**: Handles SPA navigation (swapping pages without reloading), sandbox auto-completion, drag-and-drop file reading, API calls via `fetch()`, table filtering, and updating circular score progress rings.

---

## Step-by-Step Installation

### Step 1: Clone or Navigate to the Directory
Open your terminal and navigate to the project directory:
```bash
cd /Users/darshith/OrderProof
```

### Step 2: Set Up Python Virtual Environment
We recommend using a virtual environment (`venv`) to keep dependencies isolated:
```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate
```

### Step 3: Install Required Dependencies
Install the required packages using pip:
```bash
pip install -r backend/requirements.txt
```

---

## How to Run OrderProof

Simply start the Uvicorn web server:
```bash
uvicorn backend.main:app --reload
```

Once running, Uvicorn will display:
```text
INFO:     Will watch for changes in these paths: [...]
INFO:     Uvicorn server running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

Now, open your web browser and go to:
👉 **[http://127.0.0.1:8000](http://127.0.0.1:8000)**

*(Since the frontend is mounted directly onto the backend, both run on the same port!)*

---

## Test Scenarios (Sandbox Sandbox Guide)

Use the pre-seeded orders dropdown to auto-fill the complaint form and test various risk signals:

1. **Test a Genuine Case (Low Risk, < 30%)**:
   - Select `ORD-1001` (Alice Smith).
   - Write: *"There is a black hair baked into my burger. Please look into this issue."*
   - Upload any normal camera photo.
   - **Why this works**: Alice's order was delivered 15 mins ago (no delay). Because she reports "hair" at "Burger House" (which has 2 pre-seeded "hair" complaints), the restaurant mitigation check is triggered (-15 points). The system identifies this as a restaurant issue, lowering customer risk.

2. **Test a Suspicious Case (High Risk, > 70%)**:
   - Select `ORD-1002` (Bob Jones).
   - Write: *"Found a bug in my sushi. Give me my refund now or I will sue and contact my lawyer!"* (Triggers refund bait keywords).
   - Rename your image file to `chatgpt_generated.jpg` before uploading (Triggers AI filename).
   - **Why this works**: Bob's order was delivered 3 days ago (>24h delay). Filename contains AI triggers (+25), EXIF metadata is missing (+15), and text contains bait keywords (+10). Total score will exceed 70%.

3. **Test Duplicate Image Recycle**:
   - File any complaint with an image.
   - Go to "File Complaint" again and submit the **exact same image file** under any customer/order.
   - **Why this works**: The system hashes the file content. On the second upload, it finds the matching SHA-256 hash (+30 points) and flags it immediately.
