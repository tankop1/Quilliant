import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import Layout from "./components/Layout";
import Personalize from "./pages/Personalize";
import Write from "./pages/Write";
import Question from "./pages/Question";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/personalize" replace />} />
          <Route path="personalize" element={<Personalize />} />
          <Route path="write" element={<Write />} />
          <Route path="write/:appId/:questionIndex" element={<Question />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
