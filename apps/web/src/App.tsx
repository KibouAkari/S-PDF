import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Organize } from "./pages/tools/Organize";
import { Split } from "./pages/tools/Split";
import { Watermark } from "./pages/tools/Watermark";
import { PageNumbers } from "./pages/tools/PageNumbers";
import { Compress } from "./pages/tools/Compress";
import { PdfToWord } from "./pages/tools/PdfToWord";
import { WordToPdf } from "./pages/tools/WordToPdf";
import { PdfToImages } from "./pages/tools/PdfToImages";
import { ImagesToPdf } from "./pages/tools/ImagesToPdf";
import { Editor } from "./pages/tools/Editor";

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/tools/organize" element={<Organize />} />
        <Route path="/tools/split" element={<Split />} />
        <Route path="/tools/watermark" element={<Watermark />} />
        <Route path="/tools/page-numbers" element={<PageNumbers />} />
        <Route path="/tools/compress" element={<Compress />} />
        <Route path="/tools/pdf-to-word" element={<PdfToWord />} />
        <Route path="/tools/word-to-pdf" element={<WordToPdf />} />
        <Route path="/tools/pdf-to-images" element={<PdfToImages />} />
        <Route path="/tools/images-to-pdf" element={<ImagesToPdf />} />
        <Route path="/tools/editor" element={<Editor />} />
      </Route>
    </Routes>
  );
}

export default App;
