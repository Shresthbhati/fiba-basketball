import sys
from pathlib import Path
import unittest

# Ensure src is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.analyzer import CMJAnalyzer, SquatAnalyzer
from src.evaluator import (
    generate_cmj_sequence,
    generate_occluded_sequence,
    generate_squat_sequence,
)
from src.models import AssessmentStatus, DepthAchievement


class TestVisionWorkerKinematics(unittest.TestCase):

    def setUp(self):
        self.squat_analyzer = SquatAnalyzer()
        self.cmj_analyzer = CMJAnalyzer()

    def test_squat_full_depth_three_reps(self):
        seq = generate_squat_sequence(num_reps=3, min_angle_deg=80.0, fps=30.0)
        res = self.squat_analyzer.analyze(seq)

        self.assertEqual(res.status, AssessmentStatus.ACCEPTED)
        self.assertEqual(res.source_type, "CV_ESTIMATE")
        self.assertEqual(res.rep_count, 3)
        self.assertEqual(len(res.repetitions), 3)

        for rep in res.repetitions:
            self.assertEqual(rep.depth, DepthAchievement.BELOW_PARALLEL)
            self.assertLessEqual(rep.min_knee_angle_deg, 85.0)

        self.assertIn("Full depth reached", res.feedback[0])

    def test_squat_partial_depth_reps(self):
        seq = generate_squat_sequence(num_reps=2, min_angle_deg=110.0, fps=30.0)
        res = self.squat_analyzer.analyze(seq)

        self.assertEqual(res.status, AssessmentStatus.ACCEPTED)
        self.assertEqual(res.rep_count, 2)
        for rep in res.repetitions:
            self.assertEqual(rep.depth, DepthAchievement.PARTIAL)

    def test_countermovement_jump_flight_and_height(self):
        target_flight_s = 0.50
        seq = generate_cmj_sequence(flight_time_s=target_flight_s, fps=30.0)
        res = self.cmj_analyzer.analyze(seq)

        self.assertEqual(res.status, AssessmentStatus.ACCEPTED)
        self.assertEqual(res.source_type, "CV_ESTIMATE")
        self.assertIsNotNone(res.jump_metric)

        metric = res.jump_metric
        self.assertAlmostEqual(metric.flight_time_s, target_flight_s, delta=0.08)

        # Theoretical ballistic height: (9.81 * 0.5^2) / 8 * 100 = 30.65 cm
        expected_height_cm = (9.81 * (target_flight_s**2) / 8.0) * 100.0
        self.assertAlmostEqual(metric.jump_height_cm, expected_height_cm, delta=6.0)
        self.assertGreater(metric.landing_symmetry_score, 0.90)

    def test_abstention_gate_on_occluded_video(self):
        seq = generate_occluded_sequence(fps=30.0)

        # Squat test on occluded input
        squat_res = self.squat_analyzer.analyze(seq)
        self.assertEqual(squat_res.status, AssessmentStatus.ABSTAINED)
        self.assertEqual(squat_res.rep_count, 0)
        self.assertGreater(len(squat_res.criteria_unmeasurable), 0)
        self.assertIsNotNone(squat_res.abstain_reason)

        # CMJ test on occluded input
        cmj_res = self.cmj_analyzer.analyze(seq)
        self.assertEqual(cmj_res.status, AssessmentStatus.ABSTAINED)
        self.assertIsNone(cmj_res.jump_metric)
        self.assertGreater(len(cmj_res.criteria_unmeasurable), 0)


if __name__ == "__main__":
    unittest.main()
