import datetime
from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey
from backend.database import Base

class Order(Base):
    """
    Represents an order placed by a customer.
    Used to check the time delay between delivery and complaint upload.
    """
    __tablename__ = "orders"

    id = Column(String, primary_key=True, index=True)
    customer_id = Column(String, nullable=False, index=True)
    customer_name = Column(String, nullable=False, index=True)
    restaurant_name = Column(String, nullable=False, index=True)
    delivered_at = Column(DateTime, nullable=False)

class Complaint(Base):
    """
    Represents a refund complaint uploaded by a customer.
    Stores the analysis results, risk scores, status, and metadata.
    """
    __tablename__ = "complaints"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    order_id = Column(String, nullable=False, index=True)
    customer_id = Column(String, nullable=False, index=True)
    customer_name = Column(String, nullable=False, index=True)
    restaurant_name = Column(String, nullable=False, index=True)
    complaint_text = Column(String, nullable=False)
    image_path = Column(String, nullable=False)
    image_hash = Column(String, nullable=False, index=True)
    risk_score = Column(Integer, nullable=False)
    decision = Column(String, nullable=False)  # "Likely Genuine", "Manual Review Needed", "Suspicious"
    analysis_details = Column(JSON, nullable=False)  # Dictionary containing details of all rules run
    status = Column(String, default="Pending")  # "Pending", "Approved", "Rejected"
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
