import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.analyzer import CMJAnalyzer, SquatAnalyzer
from src.evaluator import (
    generate_cmj_sequence,
    generate_occluded_sequence,
    generate_squat_sequence,
)
from src.models import AssessmentStatus, DepthAchievement


class TestVisionEvaluationHarness(unittest.TestCase):
    """Automated evaluation harness for CI regression gating (Master Spec §4.3, ADR-0006)."""

    def test_squat_batch_evaluation_benchmark(self):
        analyzer = SquatAnalyzer()
        test_cases = [
            {"reps": 1, "depth_deg": 75.0, "expected_depth": DepthAchievement.BELOW_PARALLEL},
            {"reps": 2, "depth_deg": 82.0, "expected_depth": DepthAchievement.BELOW_PARALLEL},
            {"reps": 3, "depth_deg": 92.0, "expected_depth": DepthAchievement.PARALLEL},
            {"reps": 4, "depth_deg": 115.0, "expected_depth": DepthAchievement.PARTIAL},
            {"reps": 5, "depth_deg": 78.0, "expected_depth": DepthAchievement.BELOW_PARALLEL},
        ]

        correct_reps = 0
        correct_depths = 0

        for tc in test_cases:
            seq = generate_squat_sequence(num_reps=tc["reps"], min_angle_deg=tc["depth_deg"])
            res = analyzer.analyze(seq)

            if res.rep_count == tc["reps"]:
                correct_reps += 1

            if res.repetitions and all(r.depth == tc["expected_depth"] for r in res.repetitions):
                correct_depths += 1

        rep_accuracy = correct_reps / len(test_cases)
        depth_accuracy = correct_depths / len(test_cases)

        self.assertEqual(rep_accuracy, 1.0, f"Repetition accuracy {rep_accuracy * 100}% below 100% threshold")
        self.assertEqual(depth_accuracy, 1.0, f"Depth accuracy {depth_accuracy * 100}% below 100% threshold")

    def test_cmj_batch_evaluation_benchmark(self):
        analyzer = CMJAnalyzer()
        flight_times = [0.45, 0.50, 0.58]
        errors_cm = []

        for ft in flight_times:
            seq = generate_cmj_sequence(flight_time_s=ft)
            res = analyzer.analyze(seq)

            self.assertEqual(res.status, AssessmentStatus.ACCEPTED)
            self.assertIsNotNone(res.jump_metric)

            expected_height_cm = (9.81 * (ft**2) / 8.0) * 100.0
            error = abs(res.jump_metric.jump_height_cm - expected_height_cm)
            errors_cm.append(error)

        mean_abs_error = sum(errors_cm) / len(errors_cm)
        self.assertLess(mean_abs_error, 5.0, f"Mean absolute jump height error {mean_abs_error}cm exceeds 5cm threshold")

    def test_abstention_compliance_benchmark(self):
        """Verifies zero false positives on degraded/occluded video input."""
        squat_analyzer = SquatAnalyzer()
        cmj_analyzer = CMJAnalyzer()

        for _ in range(5):
            seq = generate_occluded_sequence()
            squat_res = squat_analyzer.analyze(seq)
            cmj_res = cmj_analyzer.analyze(seq)

            self.assertEqual(squat_res.status, AssessmentStatus.ABSTAINED)
            self.assertEqual(squat_res.rep_count, 0)

            self.assertEqual(cmj_res.status, AssessmentStatus.ABSTAINED)
            self.assertIsNone(cmj_res.jump_metric)


if __name__ == "__main__":
    unittest.main()
