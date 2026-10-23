import { CareerPanel } from "../../lib/career-panel";
import { PassportShareManager } from "../../lib/passport-share-dialog";

export default function Career() {
  return (
    <main>
      <h1>Your record</h1>
      <CareerPanel />
      <PassportShareManager />
    </main>
  );
}
