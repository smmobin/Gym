"""SQLAlchemy models for GYM CONTROL v1 schema."""

from app.models.athlete_notification import AthleteNotification
from app.models.athlete_session import AthleteSession
from app.models.attendance import Attendance
from app.models.audit import AuditLog
from app.models.enums import (
    AttendanceType,
    BookingStatus,
    ExpenseCategory,
    GenderLabel,
    MemberStatus,
    MembershipStatus,
    PaymentMethod,
    PaymentStatus,
    StaffRole,
    TrialLeadStatus,
)
from app.models.expense import Expense
from app.models.group_class import ClassBooking, GroupClass
from app.models.gym_settings import GymSettings
from app.models.locker import Locker, LockerAssignment
from app.models.member import Member
from app.models.member_file_lock import MemberFileLock
from app.models.membership import Membership, MembershipPlan
from app.models.notification import StaffNotification, StaffNotificationRead
from app.models.payment import Payment
from app.models.session import StaffSession
from app.models.trainer import TrainerMemberAssignment
from app.models.trial_lead import TrialLead
from app.models.user import User
from app.models.workout import WorkoutPlan

__all__ = [
    "AthleteNotification",
    "AthleteSession",
    "Attendance",
    "AttendanceType",
    "AuditLog",
    "BookingStatus",
    "ClassBooking",
    "Expense",
    "ExpenseCategory",
    "GenderLabel",
    "GroupClass",
    "GymSettings",
    "Locker",
    "LockerAssignment",
    "Member",
    "MemberFileLock",
    "MemberStatus",
    "Membership",
    "MembershipPlan",
    "MembershipStatus",
    "Payment",
    "PaymentMethod",
    "PaymentStatus",
    "StaffNotification",
    "StaffNotificationRead",
    "StaffRole",
    "StaffSession",
    "TrainerMemberAssignment",
    "TrialLead",
    "TrialLeadStatus",
    "User",
    "WorkoutPlan",
]
