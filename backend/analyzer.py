 import io
import hashlib
import datetime
from PIL import Image
from sqlalchemy.orm import Session
from backend import crud

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
    order_id: str
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
    total_score = 10  # Starting baseline risk score (low risk)
    
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
    existing_duplicate = crud.get_complaint_by_hash(db, sha256)
    if existing_duplicate:
        score_added = 30
        total_score += score_added
        rules_triggered.append({
            "rule": "Duplicate Image Check",
            "passed": False,
            "score_added": score_added,
            "message": f"Duplicate image detected! Same file was already uploaded in Complaint #{existing_duplicate.id}."
        })
    else:
        rules_triggered.append({
            "rule": "Duplicate Image Check",
            "passed": True,
            "score_added": 0,
            "message": "Image file is unique; no matching duplicates found in history."
        })

    # ----------------------------------------------------
    # Rule 5: Delivery-to-Complaint Elapsed Time Check (+20 points)
    # ----------------------------------------------------
    order = crud.get_order(db, order_id)
    if order:
        elapsed_time = datetime.datetime.utcnow() - order.delivered_at
        hours_elapsed = elapsed_time.total_seconds() / 3600.0
        
        if hours_elapsed > 24:
            score_added = 20
            total_score += score_added
            rules_triggered.append({
                "rule": "Complaint Timing Check",
                "passed": False,
                "score_added": score_added,
                "message": f"Complaint uploaded too late: {hours_elapsed:.1f} hours after order delivery (24-hour limit)."
            })
        else:
            rules_triggered.append({
                "rule": "Complaint Timing Check",
                "passed": True,
                "score_added": 0,
                "message": f"Complaint submitted within safety window: {hours_elapsed:.1f} hours after delivery."
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
    prev_claims_count = crud.get_customer_complaint_count(db, customer_name)
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
    final_score = max(0, min(100, total_score))
    
    # Classify decision based on score thresholds
    if final_score <= 30:
        decision = "Likely Genuine"
    elif final_score <= 70:
        decision = "Manual Review Needed"
    else:
        decision = "Suspicious"

    return {
        "risk_score": final_score,
        "decision": decision,
        "rules_triggered": rules_triggered,
        "image_metadata": image_metadata,
        "image_hash": sha256
    }
