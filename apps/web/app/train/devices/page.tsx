"use client";

import React from "react";
import { SensorDeviceCard } from "../../../lib/sensor-device-card";

export default function DevicesPage() {
  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 16px" }}>
      <SensorDeviceCard />
    </div>
  );
}
