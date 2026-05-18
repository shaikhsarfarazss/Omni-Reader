# OmniReader: Intelligent Reading & Annotation Studio

OmniReader is a high-performance, hybrid mobile application designed to revolutionize how you interact with digital documents. Combining a state-of-the-art PDF engine with advanced OCR and multi-provider AI integration, OmniReader transforms passive reading into an active, intelligent learning experience.

## 🚀 Key Features

### 📖 Advanced Reading Engine
- **Immersive TTS**: Natural-sounding text-to-speech with precise, word-by-word highlighting across PDF and Text modes.
- **Dual Layouts**: Optimized mobile viewing with "Side-by-Side" and "Cover Style" two-page layouts.
- **Smart Synchronization**: Intelligent auto-scrolling that keeps the active text centered and visible during playback.

### 🔍 Precision OCR (Optical Character Recognition)
- **High-Fidelity Extraction**: Convert flattened PDFs, images, and hand-drawn annotations into editable, searchable text.
- **Dual-View OCR**: Switch between a clean, readable **Text View** and a coordinate-accurate **Layout View** that preserves document structure.
- **Atomic Rendering**: Advanced rendering pipeline that ensures pixel-perfect alignment of extracted text on mobile viewports.

### 🧠 Multi-Provider AI Integration
- **Contextual Insights**: Leverage world-class AI models to **Summarize**, **Explain**, **Simplify**, or generate **Quizzes** and **Flashcards** from your reading material.
- **Provider Choice**: Seamlessly switch between **Google Gemini**, **OpenAI**, **Claude**, **DeepSeek**, and local **Ollama** instances.
- **Adaptive Prompting**: Pre-configured pedagogical prompts designed to maximize learning retention.

### ✍️ Professional Annotation Tools
- **Rich Toolkit**: Precision Pencil, Highlighter, Eraser, and Shape tools (Rectangles, Circles, Arrows, Lines).
- **Infinite Undo/Redo**: Robust history management for complex document editing.
- **Smart Cropping**: Isolate and extract specific regions of interest for focused study or OCR.

### 📱 Mobile-First Design
- **Premium Aesthetics**: Vibrant dark/light modes, glassmorphism UI elements, and smooth micro-animations.
- **Dynamic Controls**: Optimized, compact toolbar and resizable panels that maximize screen real estate on Android devices.
- **Performance Optimized**: Lazy-loaded components and off-screen rendering to ensure a lag-free experience on both high-end and budget devices.

## 🛠 Technology Stack

- **Core**: Kotlin (Android Native Wrapper)
- **Frontend**: HTML5, Vanilla JavaScript (ES6+), CSS3
- **Styling**: Modern Vanilla CSS with HSL-based design systems
- **Engines**: 
  - **PDF.js**: Industry-standard PDF rendering.
  - **Tesseract.js**: Powerful client-side OCR.
  - **Fabric.js**: Advanced canvas-based annotation and shape manipulation.
  - **jsPDF**: Client-side PDF generation and export.
- **Architecture**: Hybrid WebView bridge for high-speed cross-platform performance.

## 📦 Project Structure

- `android/`: Native Android project container.
- `public/`: Core web application assets.
  - `index.html`: Main application entry point and logic.
  - `assets/`: 
    - `tesseract/`: Offline OCR worker and WASM files.
    - `fonts/`: Modern typography (Inter, Outfit).
- `README.md`: Project documentation.

## ⚙️ Configuration

To unlock the full power of OmniReader's AI features, you can configure your API keys directly in the **AI Tools** menu within the application. OmniReader supports:
- Google Gemini API
- OpenAI API (GPT-4o mini)
- Anthropic Claude API
- DeepSeek API
- Local Ollama Endpoints (for privacy-focused local processing)

---

Developed with ❤️ by Sarfaraz Shaikh
*Transforming the way the world reads.*
