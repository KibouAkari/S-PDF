import {
  Combine,
  Scissors,
  RotateCw,
  Droplets,
  Hash,
  Shrink,
  FileText,
  FileType2,
  Images,
  Image as ImageIcon,
  PenTool,
} from "lucide-react";
import type { ComponentType } from "react";

export interface ToolMeta {
  id: string;
  title: string;
  description: string;
  path: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  category: "Organize" | "Convert" | "Edit" | "Enhance";
}

export const TOOLS: ToolMeta[] = [
  {
    id: "organize",
    title: "Merge & Organize",
    description: "Combine multiple PDFs, reorder, rotate, or delete pages with a visual page tray.",
    path: "/tools/organize",
    icon: Combine,
    category: "Organize",
  },
  {
    id: "split",
    title: "Split PDF",
    description: "Extract page ranges into separate PDF files.",
    path: "/tools/split",
    icon: Scissors,
    category: "Organize",
  },
  {
    id: "editor",
    title: "Edit PDF",
    description: "Add and move text, images, and shapes directly on the page — like a real editor.",
    path: "/tools/editor",
    icon: PenTool,
    category: "Edit",
  },
  {
    id: "pdf-to-word",
    title: "PDF to Word",
    description: "Convert PDFs into fully editable Word (.docx) documents.",
    path: "/tools/pdf-to-word",
    icon: FileText,
    category: "Convert",
  },
  {
    id: "word-to-pdf",
    title: "Word to PDF",
    description: "Turn Word documents into polished, portable PDFs.",
    path: "/tools/word-to-pdf",
    icon: FileType2,
    category: "Convert",
  },
  {
    id: "pdf-to-images",
    title: "PDF to Images",
    description: "Export every page as a high-resolution PNG image.",
    path: "/tools/pdf-to-images",
    icon: Images,
    category: "Convert",
  },
  {
    id: "images-to-pdf",
    title: "Images to PDF",
    description: "Combine JPG, PNG or WEBP images into a single PDF.",
    path: "/tools/images-to-pdf",
    icon: ImageIcon,
    category: "Convert",
  },
  {
    id: "watermark",
    title: "Watermark",
    description: "Stamp a custom text watermark across every page.",
    path: "/tools/watermark",
    icon: Droplets,
    category: "Enhance",
  },
  {
    id: "page-numbers",
    title: "Page Numbers",
    description: "Add page numbers with full control over position and format.",
    path: "/tools/page-numbers",
    icon: Hash,
    category: "Enhance",
  },
  {
    id: "compress",
    title: "Compress PDF",
    description: "Shrink file size by re-encoding embedded images.",
    path: "/tools/compress",
    icon: Shrink,
    category: "Enhance",
  },
  {
    id: "rotate",
    title: "Rotate Pages",
    description: "Rotate every page — or just the ones you pick — in one click.",
    path: "/tools/organize?mode=rotate",
    icon: RotateCw,
    category: "Organize",
  },
];
