import { PrivacySettingsCard } from "../../lib/privacy-settings-card";

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "1.5rem" }}>
      <h1 style={{ color: "#f8fafc", marginBottom: "0.25rem" }}>Privacy &amp; Data Rights</h1>
      <p style={{ color: "#94a3b8", marginBottom: "1.5rem", fontSize: "0.95rem" }}>
        Exercise your international privacy rights under GDPR and CCPA, including full machine-readable personal data export and right to erasure.
      </p>
      <PrivacySettingsCard />
    </main>
  );
}
