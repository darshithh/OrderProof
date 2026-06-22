from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime

class OrderBase(BaseModel):
    id: str
    customer_id: str
    customer_name: str
    restaurant_name: str
    delivered_at: datetime

    class Config:
        from_attributes = True

class OrderResponse(OrderBase):
    pass

class ComplaintResponse(BaseModel):
    id: int
    order_id: str
    customer_id: str
    customer_name: str
    restaurant_name: str
    complaint_text: str
    image_path: str
    image_hash: str
    risk_score: int
    decision: str
    analysis_details: Dict[str, Any]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class DashboardStats(BaseModel):
    total_complaints: int
    genuine_count: int
    review_count: int
    suspicious_count: int
    pending_count: int
    approved_count: int
    rejected_count: int
    recent_complaints: List[ComplaintResponse]

    class Config:
        from_attributes = True
