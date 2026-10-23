from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional


class AssessmentStatus(str, Enum):
    ACCEPTED = "ACCEPTED"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    ABSTAINED = "ABSTAINED"


class DepthAchievement(str, Enum):
    BELOW_PARALLEL = "BELOW_PARALLEL"
    PARALLEL = "PARALLEL"
    PARTIAL = "PARTIAL"


@dataclass
class Landmark:
    x: float
    y: float
    z: float = 0.0
    visibility: float = 1.0


@dataclass
class PoseFrame:
    timestamp_ms: float
    frame_index: int
    landmarks: List[Landmark]


@dataclass
class PoseSequence:
    fps: float
    duration_seconds: float
    frames: List[PoseFrame]


@dataclass
class Repetition:
    rep_number: int
    start_time_s: float
    inflection_time_s: float
    end_time_s: float
    duration_s: float
    min_knee_angle_deg: float
    torso_lean_deg: float
    depth: DepthAchievement


@dataclass
class JumpMetric:
    takeoff_time_s: float
    touchdown_time_s: float
    flight_time_s: float
    jump_height_cm: float
    landing_symmetry_score: float  # 0.0 to 1.0


@dataclass
class AssessmentResult:
    source_type: str = "CV_ESTIMATE"
    protocol: str = "UNKNOWN"
    status: AssessmentStatus = AssessmentStatus.ACCEPTED
    confidence: float = 1.0
    model_version: str = "court-iq-pose-v1.0"
    protocol_version: str = "protocol-v1.0"
    rep_count: int = 0
    repetitions: List[Repetition] = field(default_factory=list)
    jump_metric: Optional[JumpMetric] = None
    criteria_unmeasurable: List[str] = field(default_factory=list)
    feedback: List[str] = field(default_factory=list)
    abstain_reason: Optional[str] = None
