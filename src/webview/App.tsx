import { AqlBuilder } from './views/AqlBuilder';
import { RequestForm } from './views/RequestForm';

// The extension tells us which view this panel shows (see panels/webviewHtml.ts).
const view = document.getElementById('root')?.dataset.view;

export function App() {
  return view === 'request' ? <RequestForm /> : <AqlBuilder />;
}
