import math
from typing import List

from .models import Landmark, PoseFrame, PoseSequence


def make_full_landmarks(knee_angle_deg: float, ankle_y_offset: float = 0.0, visibility: float = 1.0) -> List[Landmark]:
    """Generates 33 landmarks for side view given an exact knee flexion angle."""
    landmarks = [Landmark(x=0.5, y=0.5, visibility=visibility) for _ in range(33)]

    # Ankle and knee baseline
    ankle_y = 0.94 - ankle_y_offset
    ankle_x = 0.48
    knee_x = 0.54
    knee_y = 0.72

    landmarks[27] = Landmark(x=ankle_x, y=ankle_y, visibility=visibility)
    landmarks[28] = Landmark(x=ankle_x, y=ankle_y, visibility=visibility)

    landmarks[25] = Landmark(x=knee_x, y=knee_y, visibility=visibility)
    landmarks[26] = Landmark(x=knee_x, y=knee_y, visibility=visibility)

    # Calculate hip position so angle at knee vertex is exactly knee_angle_deg
    va = (ankle_x - knee_x, ankle_y - knee_y)
    ang_va = math.atan2(va[1], va[0])
    ang_vh = ang_va - math.radians(knee_angle_deg)
    thigh_len = 0.22
    hip_x = knee_x + thigh_len * math.cos(ang_vh)
    hip_y = knee_y + thigh_len * math.sin(ang_vh)

    landmarks[23] = Landmark(x=hip_x, y=hip_y, visibility=visibility)
    landmarks[24] = Landmark(x=hip_x, y=hip_y, visibility=visibility)

    # Torso and shoulder above hip
    landmarks[11] = Landmark(x=hip_x + 0.03, y=hip_y - 0.26, visibility=visibility)
    landmarks[12] = Landmark(x=hip_x + 0.03, y=hip_y - 0.26, visibility=visibility)

    # Foot index forward of ankle
    landmarks[31] = Landmark(x=ankle_x + 0.08, y=ankle_y + 0.02, visibility=visibility)
    landmarks[32] = Landmark(x=ankle_x + 0.08, y=ankle_y + 0.02, visibility=visibility)

    return landmarks


def generate_squat_sequence(
    num_reps: int = 3, min_angle_deg: float = 80.0, fps: float = 30.0, rep_duration_s: float = 2.0
) -> PoseSequence:
    """Generates synthetic kinematics for squats."""
    frames_per_rep = int(fps * rep_duration_s)
    frames: List[PoseFrame] = []
    current_ms = 0.0
    dt_ms = 1000.0 / fps

    # Initial standing pause (0.5s)
    for _ in range(int(fps * 0.5)):
        frames.append(PoseFrame(timestamp_ms=current_ms, frame_index=len(frames), landmarks=make_full_landmarks(175.0)))
        current_ms += dt_ms

    for _ in range(num_reps):
        for step in range(frames_per_rep):
            phase = step / frames_per_rep  # 0 to 1
            # Cosine curve from 175 down to min_angle_deg and back
            t = (1 - math.cos(phase * 2 * math.pi)) / 2  # 0 at start/end, 1 at middle
            angle = 175.0 - t * (175.0 - min_angle_deg)

            frames.append(PoseFrame(timestamp_ms=current_ms, frame_index=len(frames), landmarks=make_full_landmarks(angle)))
            current_ms += dt_ms

    # Final standing pause (0.5s)
    for _ in range(int(fps * 0.5)):
        frames.append(PoseFrame(timestamp_ms=current_ms, frame_index=len(frames), landmarks=make_full_landmarks(175.0)))
        current_ms += dt_ms

    return PoseSequence(fps=fps, duration_seconds=current_ms / 1000.0, frames=frames)


def generate_cmj_sequence(flight_time_s: float = 0.50, fps: float = 30.0) -> PoseSequence:
    """Generates synthetic kinematics for Countermovement Jump."""
    frames: List[PoseFrame] = []
    current_ms = 0.0
    dt_ms = 1000.0 / fps

    # 1. Standing phase (0.6s)
    for _ in range(int(fps * 0.6)):
        frames.append(PoseFrame(timestamp_ms=current_ms, frame_index=len(frames), landmarks=make_full_landmarks(175.0)))
        current_ms += dt_ms

    # 2. Countermovement dip (0.4s)
    dip_frames = int(fps * 0.4)
    for step in range(dip_frames):
        phase = step / dip_frames
        angle = 175.0 - math.sin(phase * math.pi) * 65.0
        frames.append(PoseFrame(timestamp_ms=current_ms, frame_index=len(frames), landmarks=make_full_landmarks(angle)))
        current_ms += dt_ms

    # 3. Flight phase
    flight_frames = int(fps * flight_time_s)
    for step in range(flight_frames):
        phase = step / flight_frames
        elevation = math.sin(phase * math.pi) * 0.08 + 0.035
        frames.append(
            PoseFrame(
                timestamp_ms=current_ms,
                frame_index=len(frames),
                landmarks=make_full_landmarks(170.0, ankle_y_offset=elevation),
            )
        )
        current_ms += dt_ms

    # 4. Landing absorption (0.5s)
    land_frames = int(fps * 0.5)
    for step in range(land_frames):
        phase = step / land_frames
        angle = 130.0 + (1 - math.cos(phase * math.pi)) / 2 * 45.0
        frames.append(PoseFrame(timestamp_ms=current_ms, frame_index=len(frames), landmarks=make_full_landmarks(angle)))
        current_ms += dt_ms

    return PoseSequence(fps=fps, duration_seconds=current_ms / 1000.0, frames=frames)


def generate_occluded_sequence(fps: float = 30.0) -> PoseSequence:
    """Generates low-visibility sequence to verify abstention behavior."""
    frames: List[PoseFrame] = []
    current_ms = 0.0
    dt_ms = 1000.0 / fps

    for _ in range(int(fps * 2.0)):
        # Landmark visibility set to 0.2 (poor lighting / camera occlusion)
        frames.append(PoseFrame(timestamp_ms=current_ms, frame_index=len(frames), landmarks=make_full_landmarks(170.0, visibility=0.2)))
        current_ms += dt_ms

    return PoseSequence(fps=fps, duration_seconds=current_ms / 1000.0, frames=frames)
