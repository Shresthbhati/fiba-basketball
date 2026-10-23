# COURT IQ Metrics Dictionary (WP-3.4, Master Spec §6.4)

All metrics in COURT IQ are derived directly from verified event logs (`match_events`), with provenance tracked as `SourceType = OFFICIAL`. Metrics are computed on demand and never stored as denormalized totals, ensuring perfect consistency after corrections.

---

## 1. Shooting & Scoring Metrics

### Field Goals Made & Attempted (FGM / FGA)
- **Definition:** Total shots attempted and made from the field (including 2-pointers and 3-pointers; excluding free throws).
- **Formula:**
  $$\text{FGM} = \text{2PM} + \text{3PM}$$
  $$\text{FGA} = \text{2PA} + \text{3PA}$$
- **Source Events:** `FIELD_GOAL`, `FIELD_GOAL_MISSED`, `THREE_POINT`, `THREE_POINT_MISSED`. Corrected events (`CORRECTION`) are strictly voided.
- **Sample Size:** Explicit total count displayed alongside every percentage.

### Field Goal Percentage (FG%)
- **Formula:**
  $$\text{FG\%} = \frac{\text{FGM}}{\text{FGA}} \times 100\%$$
- **Condition:** If $\text{FGA} = 0$, $\text{FG\%} = 0.0\%$.

### Two-Point Field Goals (2PM / 2PA / 2P%)
- **Definition:** Shots taken inside the FIBA 6.75m arc.
- **Formula:**
  $$\text{2P\%} = \frac{\text{2PM}}{\text{2PA}} \times 100\%$$
- **Source Events:** `FIELD_GOAL`, `FIELD_GOAL_MISSED`.

### Three-Point Field Goals (3PM / 3PA / 3P%)
- **Definition:** Shots taken behind the FIBA 6.75m arc (or 6.60m from sideline in the corners).
- **Formula:**
  $$\text{3P\%} = \frac{\text{3PM}}{\text{3PA}} \times 100\%$$
- **Source Events:** `THREE_POINT`, `THREE_POINT_MISSED`.

### Free Throws (FTM / FTA / FT%)
- **Definition:** Uncontested 1-point penalty attempts from the free-throw line (5.80m from baseline).
- **Formula:**
  $$\text{FT\%} = \frac{\text{FTM}}{\text{FTA}} \times 100\%$$
- **Source Events:** `FREE_THROW`, `FREE_THROW_MISSED`.

### Effective Field Goal Percentage (eFG%)
- **Definition:** Adjusts field goal percentage to account for the fact that a made 3-point field goal is worth 50% more than a 2-point field goal.
- **Formula:**
  $$\text{eFG\%} = \frac{\text{FGM} + 0.5 \times \text{3PM}}{\text{FGA}} \times 100\%$$
- **Condition:** If $\text{FGA} = 0$, $\text{eFG\%} = 0.0\%$.

### True Shooting Percentage (TS%)
- **Definition:** Measures shooting efficiency by taking into account 2-point field goals, 3-point field goals, and free throws. The coefficient 0.44 estimates free throw possessions.
- **Formula:**
  $$\text{TS\%} = \frac{\text{Total Points}}{2 \times (\text{FGA} + 0.44 \times \text{FTA})} \times 100\%$$
- **Condition:** If $\text{FGA} + 0.44 \times \text{FTA} = 0$, $\text{TS\%} = 0.0\%$.

---

## 2. Court Shot Zones & Spatial Geometry

Court coordinates follow FIBA Official Rules (28.0m × 15.0m). For half-court analytics, coordinates are standardized to the attacking basket:
- **Court Origin:** Center-court line ($X = 0.0\text{m}$), baseline ($X = 14.0\text{m}$).
- **Width:** Sideline to sideline ($Y = -7.5\text{m}$ to $+7.5\text{m}$, hoop center at $Y = 0.0\text{m}$).
- **Hoop Center:** $X_{\text{hoop}} = 12.425\text{m}$, $Y_{\text{hoop}} = 0.0\text{m}$ ($1.575\text{m}$ from baseline).

### Zone Definitions
1. **`RESTRICTED_AREA`**:
   - Distance from hoop center: $d \le 1.25\text{m}$ (no-charge semi-circle).
2. **`PAINT`**:
   - Inside the key ($X \ge 8.20\text{m}$, $|Y| \le 2.45\text{m}$) outside the restricted area ($d > 1.25\text{m}$).
3. **`MID_RANGE`**:
   - Inside the 3-point boundary, outside the key and restricted area ($d < 6.75\text{m}$, $|Y| < 6.60\text{m}$).
4. **`CORNER_THREE_LEFT`**:
   - Left corner behind 3PT line ($Y < -6.60\text{m}$, $X \ge 11.01\text{m}$).
5. **`CORNER_THREE_RIGHT`**:
   - Right corner behind 3PT line ($Y > +6.60\text{m}$, $X \ge 11.01\text{m}$).
6. **`ABOVE_THE_BREAK_THREE`**:
   - Non-corner 3-pointers behind the 6.75m arc ($d \ge 6.75\text{m}$, $|Y| < 6.60\text{m}$).
7. **`BACKCOURT`**:
   - Beyond half court ($X < 0.0\text{m}$ or $d > 14.0\text{m}$).

### Zone Stats Aggregation
For each zone:
- $\text{Makes} = \sum \text{Shots Made in Zone}$
- $\text{Attempts} = \sum \text{Shots Attempted in Zone}$
- $\text{Zone FG\%} = \frac{\text{Makes}}{\text{Attempts}} \times 100\%$
- $\text{Points} = (\text{Makes}_{2\text{P}} \times 2) + (\text{Makes}_{3\text{P}} \times 3)$
- $\text{Frequency\%} = \frac{\text{Attempts in Zone}}{\text{Total FGA}} \times 100\%$

---

## 3. Sample Size & Reliability Rules
- Every metric displayed on cards, shot charts, or scouting reports MUST show the sample size:
  e.g. `45.2% (14/31 FG)`.
- When $N < 10$ attempts for a zone or player, an indicator states *"Small sample size ($N < 10$)"*.
- In accordance with **ADR-0008**, all statistics derive from verified official events and display `SourceType = OFFICIAL`.
