import { NotificationsPanel } from "../../lib/notifications-panel";
import { NotificationPreferencesCard } from "../../lib/notification-preferences-card";

export default function Notifications() {
  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "1.5rem", display: "grid", gap: "2rem" }}>
      <div>
        <h1 style={{ color: "#f8fafc", marginBottom: "0.5rem" }}>Notifications</h1>
        <NotificationsPanel />
      </div>
      <div>
        <NotificationPreferencesCard />
      </div>
    </main>
  );
}
