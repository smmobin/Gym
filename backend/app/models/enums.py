"""Shared enums for GYM CONTROL domain models."""

from enum import StrEnum


class StaffRole(StrEnum):
    MANAGER = "manager"
    RECEPTIONIST = "receptionist"
    TRAINER = "trainer"


class MemberStatus(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    ARCHIVED = "archived"


class MembershipStatus(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    FROZEN = "frozen"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class PaymentMethod(StrEnum):
    CASH = "cash"
    POS = "pos"
    TRANSFER = "transfer"
    ONLINE = "online"  # placeholder until gateway exists


class PaymentStatus(StrEnum):
    PAID = "paid"
    PENDING = "pending"
    REFUNDED = "refunded"


class AttendanceType(StrEnum):
    GYM = "gym"
    CLASS = "class"
    PT = "pt"


class GenderLabel(StrEnum):
    """Display-only class label; not used to reject bookings."""

    MEN = "men"
    WOMEN = "women"
    MIXED = "mixed"


class BookingStatus(StrEnum):
    BOOKED = "booked"
    CANCELLED = "cancelled"
    ATTENDED = "attended"
    NO_SHOW = "no_show"


class TrialLeadStatus(StrEnum):
    NEW = "new"
    CONTACTED = "contacted"
    CONVERTED = "converted"
    CLOSED = "closed"


class ExpenseCategory(StrEnum):
    RENT = "rent"
    SALARY = "salary"
    PURCHASE = "purchase"
    UTILITIES = "utilities"
    OTHER = "other"
