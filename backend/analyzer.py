import io
import os
import hashlib
import datetime
# pyrefly: ignore [missing-import]
from PIL import Image
from sqlalchemy.orm import Session
from backend import crud

# Define base directory of the project to locate files
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def get_dhash(image_bytes: bytes) -> str:
    """
    Computes a 64-bit Difference Hash (dHash) for an image.
    1. Grayscale the image
    2. Resize to 9x8
    3. Compare adjacent pixels in each row
    4. Convert 64 bits to 16 hex characters
    """
    try:
        image = Image.open(io.BytesIO(image_bytes))
        # Convert to grayscale and resize to 9x8
        # Use safe resampling that is compatible across Pillow versions
        resample_filter = Image.Resampling.LANCZOS if hasattr(Image, 'Resampling') else Image.ANTIALIAS
        image = image.convert('L').resize((9, 8), resample_filter)
        pixels = list(image.getdata())
        
        difference = []
        for row in range(8):
            for col in range(8):
                pixel_left = pixels[row * 9 + col]
                pixel_right = pixels[row * 9 + col + 1]
                difference.append(pixel_left > pixel_right)
        
        # Convert bits to 16-char hex string
        decimal_val = 0
        for bit in difference:
            decimal_val = (decimal_val << 1) | bit
        return f"{decimal_val:016x}"
    except Exception as e:
        print(f"Error generating dhash: {e}")
        return None

def hamming_distance(hash1: str, hash2: str) -> int:
    """Computes the Hamming distance between two 16-character hex dHash strings."""
    if not hash1 or not hash2 or len(hash1) != len(hash2):
        return 999
    # Convert hex strings to integers and XOR them
    x = int(hash1, 16) ^ int(hash2, 16)
    # Count the set bits (binary 1s)
    return bin(x).count('1')

# List of suspicious filenames indicating AI-generated images
AI_KEYWORDS = ["chatgpt", "dalle", "midjourney", "stable-diffusion", "leonardo", "ideogram", "generative"]

# High-pressure or legal refund-related keywords
SUSPICIOUS_TEXT_KEYWORDS = ["refund", "money back", "compensation", "sue", "lawyer", "legal", "court"]

# Issue categories to match restaurant history
ISSUE_KEYWORDS = ["hair", "insect", "bug", "lizard", "plastic", "glass", "hygiene", "unhygienic", "roach", "fly"]

def analyze_complaint(
    db: Session,
    filename: str,
    file_content: bytes,
    customer_name: str,
    restaurant_name: str,
    complaint_text: str,
    order_id: str,
    customer_id: str
) -> dict:
    """
    Main analysis engine. Combines multiple rules to calculate a risk score (0-100).
    
    Returns a dictionary containing:
    - risk_score: Int (0 - 100)
    - decision: Str ("Likely Genuine", "Manual Review Needed", "Suspicious")
    - rules_triggered: List of dicts (description, score_added, passed)
    - image_metadata: Dict (width, height, format, has_exif)
    """
    rules_triggered = []
    total_score = 0  # Starting baseline risk score (low risk)
    
    # ----------------------------------------------------
    # Rule 1: AI Tool Name in Filename Check (+25 points)
    # ----------------------------------------------------
    filename_lower = filename.lower()
    ai_found = [kw for kw in AI_KEYWORDS if kw in filename_lower]
    if ai_found:
        score_added = 25
        total_score += score_added
        rules_triggered.append({
            "rule": "AI Filename Check",
            "passed": False,
            "score_added": score_added,
            "message": f"Filename contains AI generation tool signature ({', '.join(ai_found)})."
        })
    else:
        rules_triggered.append({
            "rule": "AI Filename Check",
            "passed": True,
            "score_added": 0,
            "message": "Filename does not contain known AI-generated signatures."
        })

    # ----------------------------------------------------
    # Rule 2: Image Processing & EXIF Metadata Check (+15 points)
    # ----------------------------------------------------
    has_exif = False
    img_width, img_height, img_format = 0, 0, "Unknown"
    try:
        image = Image.open(io.BytesIO(file_content))
        img_width, img_height = image.size
        img_format = image.format
        
        # Check for EXIF metadata. Normal mobile phone photographs almost always contain EXIF.
        # Screenshots, web downloads, or AI-generated images usually do not.
        if hasattr(image, '_getexif') and image._getexif() is not None:
            exif = image._getexif()
            if len(exif) > 0:
                has_exif = True
    except Exception as e:
        # If image cannot be read, it's highly suspicious (potential malformed file payload)
        pass

    image_metadata = {
        "width": img_width,
        "height": img_height,
        "format": img_format,
        "has_exif": has_exif
    }

    if not has_exif:
        score_added = 15
        total_score += score_added
        rules_triggered.append({
            "rule": "EXIF Metadata Check",
            "passed": False,
            "score_added": score_added,
            "message": "No EXIF camera metadata found. Image might be a screenshot or edited."
        })
    else:
        rules_triggered.append({
            "rule": "EXIF Metadata Check",
            "passed": True,
            "score_added": 0,
            "message": "Valid camera metadata (EXIF) found in image."
        })

    # ----------------------------------------------------
    # Rule 3: Image Size / Dimensions Check (+5 points if suspiciously low)
    # ----------------------------------------------------
    if img_width > 0 and (img_width < 400 or img_height < 400):
        score_added = 5
        total_score += score_added
        rules_triggered.append({
            "rule": "Low Resolution Check",
            "passed": False,
            "score_added": score_added,
            "message": f"Image resolution is very low ({img_width}x{img_height}), common for web thumbnails."
        })
    else:
        rules_triggered.append({
            "rule": "Low Resolution Check",
            "passed": True,
            "score_added": 0,
            "message": "Image resolution is standard for mobile cameras."
        })

    # ----------------------------------------------------
    # Rule 4: Duplicate Image Hash Check (+30 points)
    # ----------------------------------------------------
    sha256 = hashlib.sha256(file_content).hexdigest()
    uploaded_dhash = get_dhash(file_content)
    
    # Let's perform a comprehensive scan across all historic complaints in the database
    all_complaints = crud.get_all_complaints(db)
    
    exact_match_complaint = None
    visual_match_complaint = None
    min_hamming_dist = 999
    
    for c in all_complaints:
        # 1. Exact SHA-256 match
        if c.image_hash == sha256:
            exact_match_complaint = c
            min_hamming_dist = 0
            break  # Exact match is the strongest, we can stop here
            
        # 2. Visual similarity match via dHash
        # Check if the complaint has a pre-calculated dhash in its analysis_details
        c_details = c.analysis_details or {}
        c_dhash = c_details.get("duplicate_detection", {}).get("dhash")
        
        # If not present, try to compute it on the fly by reading its file from uploads/
        if not c_dhash:
            try:
                abs_path = os.path.join(BASE_DIR, c.image_path)
                if os.path.exists(abs_path):
                    with open(abs_path, "rb") as img_f:
                        img_bytes = img_f.read()
                    c_dhash = get_dhash(img_bytes)
            except Exception as ex:
                print(f"Failed to calculate dhash for historical complaint #{c.id}: {ex}")
                
        if c_dhash and uploaded_dhash:
            dist = hamming_distance(uploaded_dhash, c_dhash)
            if dist <= 10 and dist < min_hamming_dist:
                min_hamming_dist = dist
                visual_match_complaint = c
                
    # Determine duplicate status
    dup_details = {
        "exact_match": exact_match_complaint is not None,
        "visual_match": visual_match_complaint is not None or exact_match_complaint is not None,
        "exact_match_id": exact_match_complaint.id if exact_match_complaint else None,
        "visual_match_id": exact_match_complaint.id if exact_match_complaint else (visual_match_complaint.id if visual_match_complaint else None),
        "sha256": sha256,
        "dhash": uploaded_dhash,
        "hamming_distance": min_hamming_dist if (exact_match_complaint or visual_match_complaint) else None
    }
    
    if dup_details["exact_match"]:
        score_added = 30
        total_score += score_added
        rules_triggered.append({
            "rule": "Exact Duplicate Detection",
            "passed": False,
            "score_added": score_added,
            "message": f"Exact duplicate image detected (SHA-256 match) with Complaint #{dup_details['exact_match_id']}."
        })
    elif dup_details["visual_match"]:
        score_added = 30
        total_score += score_added
        rules_triggered.append({
            "rule": "Visual Similarity Match (Perceptual Hash)",
            "passed": False,
            "score_added": score_added,
            "message": f"Visually similar image detected (perceptual hash match) with Complaint #{dup_details['visual_match_id']} (Hamming distance: {dup_details['hamming_distance']}/64)."
        })
    else:
        rules_triggered.append({
            "rule": "Exact Duplicate Detection",
            "passed": True,
            "score_added": 0,
            "message": "Image file is unique; no matching duplicates or visually similar images found in history."
        })

    # ----------------------------------------------------
    # Rule 5: Delivery-to-Complaint Elapsed Time Check (+20 points)
    # ----------------------------------------------------
    order = crud.get_order(db, order_id)
    if order:
        elapsed_time = datetime.datetime.utcnow() - order.delivered_at
        minutes_elapsed= elapsed_time.total_seconds() / 60.0
        
        if minutes_elapsed > 30:
            score_added = 20
            total_score += score_added
            rules_triggered.append({
                "rule": "Complaint Timing Check",
                "passed": False,
                "score_added": score_added,
                "message": f"Complaint uploaded too late: {minutes_elapsed:.1f} minutes after order delivery (30-minute limit)."
            })
        else:
            rules_triggered.append({
                "rule": "Complaint Timing Check",
                "passed": True,
                "score_added": 0,
                "message": f"Complaint submitted within safety window: {minutes_elapsed:.1f} minutes after delivery."
            })
    else:
        # Order ID not found
        score_added = 15
        total_score += score_added
        rules_triggered.append({
            "rule": "Order Validation Check",
            "passed": False,
            "score_added": score_added,
            "message": "Order ID not found in database. Suspicious order reference."
        })

    # ----------------------------------------------------
    # Rule 6: Customer Complaint History Check (+20 points)
    # ----------------------------------------------------
    prev_claims_count = crud.get_customer_complaint_count(db, customer_id)
    # If the user has 2 or more previous claims, this submission makes it 3+
    if prev_claims_count >= 2:
        score_added = 20
        total_score += score_added
        rules_triggered.append({
            "rule": "Customer Claims History Check",
            "passed": False,
            "score_added": score_added,
            "message": f"Customer '{customer_name}' has high claim volume ({prev_claims_count} previous complaints)."
        })
    else:
        rules_triggered.append({
            "rule": "Customer Claims History Check",
            "passed": True,
            "score_added": 0,
            "message": f"Customer has clean claim history ({prev_claims_count} previous complaints)."
        })

    # ----------------------------------------------------
    # Rule 7: Restaurant Similar Complaints Check (-15 points - Mitigating Factor!)
    # ----------------------------------------------------
    # Identify key issue from complaint text
    found_issue_kw = None
    text_lower = complaint_text.lower()
    for kw in ISSUE_KEYWORDS:
        if kw in text_lower:
            found_issue_kw = kw
            break
            
    if found_issue_kw:
        restaurant_similar_count = crud.get_restaurant_similar_complaints_count(
            db, restaurant_name, found_issue_kw
        )
        # If the restaurant has 2 or more complaints matching the same issue, it's highly likely a real systemic issue.
        if restaurant_similar_count >= 2:
            score_mitigated = 15
            total_score -= score_mitigated
            rules_triggered.append({
                "rule": "Restaurant Coherence Check",
                "passed": True,  # Mitigating rule passing is positive
                "score_added": -score_mitigated,
                "message": f"Corroborating record: {restaurant_similar_count} complaints for '{restaurant_name}' also report issues containing '{found_issue_kw}'."
            })
        else:
            rules_triggered.append({
                "rule": "Restaurant Coherence Check",
                "passed": True,
                "score_added": 0,
                "message": f"No outstanding matching issue history found for restaurant '{restaurant_name}'."
            })
    else:
        rules_triggered.append({
            "rule": "Restaurant Coherence Check",
            "passed": True,
            "score_added": 0,
            "message": "No standard issue keywords (hair, bug, plastic, etc.) detected to perform restaurant lookup."
        })

    # ----------------------------------------------------
    # Rule 8: High Pressure Text Keywords Check (+10 points)
    # ----------------------------------------------------
    flagged_words = [kw for kw in SUSPICIOUS_TEXT_KEYWORDS if kw in text_lower]
    if flagged_words:
        score_added = 10
        total_score += score_added
        rules_triggered.append({
            "rule": "Suspicious Text Check",
            "passed": False,
            "score_added": score_added,
            "message": f"Text contains high-pressure refund bait words: {', '.join(flagged_words)}."
        })
    else:
        rules_triggered.append({
            "rule": "Suspicious Text Check",
            "passed": True,
            "score_added": 0,
            "message": "Complaint description uses standard customer language."
        })

    # Clamp the final risk score between 0 and 100
    risk_score = max(0, min(total_score, 100))
    
    # Classify decision based on score thresholds
    if risk_score <= 30:
        decision = "Likely Genuine"
    elif risk_score <= 70:
        decision = "Manual Review Needed"
    else:
        decision = "Suspicious"

    return {
        "risk_score": risk_score,
        "decision": decision,
        "rules_triggered": rules_triggered,
        "image_metadata": image_metadata,
        "image_hash": sha256,
        "dhash": uploaded_dhash,
        "duplicate_detection": dup_details
    }
