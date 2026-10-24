import { AqlBuilder } from './views/AqlBuilder';

// Only one view for now; the REST request panel (Phase 4) will add routing here.
export function App() {
  return <AqlBuilder />;
}
