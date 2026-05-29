import { NetworkDashboard } from "./features/network";
import styles from "./App.module.scss";

function App() {
  return (
    <main className={styles.app}>
      <NetworkDashboard />
    </main>
  );
}

export default App;
