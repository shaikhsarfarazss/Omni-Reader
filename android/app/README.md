# OmniReader: Intelligent Reading & Annotation Studio

OmniReader is a high-performance, hybrid mobile application designed to revolutionize how you interact with digital documents. Combining a state-of-the-art PDF engine with advanced OCR, precise Text-to-Speech (TTS), and multi-provider AI integration, OmniReader transforms passive reading into an active, intelligent learning experience.

## 🚀 Key Features

### 📖 Advanced Reading Engine
- **Immersive TTS**: Natural-sounding text-to-speech with precise, word-by-word highlighting across PDF and Text modes. Features automatic filtering for high-quality regional voices (e.g., `en-IN`, `hi-IN`).
- **Dual Layouts**: Optimized mobile viewing with "Side-by-Side" and "Cover Style" two-page layouts.
- **Smart Synchronization**: Intelligent auto-scrolling that keeps the active text centered and visible during playback.

### 🔍 Precision OCR (Optical Character Recognition)
- **High-Fidelity Extraction**: Convert flattened PDFs, images, and hand-drawn annotations into editable, searchable text.
- **Dual-View OCR**: Switch between a clean, readable **Text View** and a coordinate-accurate **Layout View** that preserves document structure.
- **Atomic Rendering**: Advanced rendering pipeline that ensures pixel-perfect alignment of extracted text on mobile viewports.

### 🧠 Multi-Provider AI Integration
- **Contextual Insights**: Leverage world-class AI models to **Summarize**, **Explain**, **Simplify**, or generate **Quizzes** and **Flashcards** from your reading material.
- **Provider Choice**: Seamlessly switch between **Google Gemini**, **OpenAI**, **Claude**, **DeepSeek**, and local **Ollama** instances.
- **Structured Visuals**: Prompts for `Quiz` and `Flashcards` extract structured JSON to render interactive card decks and formatted multiple-choice components instead of raw text.

### ✍️ Professional Annotation Tools & Crop Editor
- **Rich Canvas**: Precision Pencil, Highlighter, Eraser, and Shape tools (Rectangles, Circles, Arrows, Lines) powered by Fabric.js.
- **Infinite History**: Full Undo/Redo tracking for complex document annotations.
- **Gesture Crop Editor**: Isolate and extract specific regions of interest. Features built-in 90° rotation, horizontal/vertical mirroring/flipping, and a precise rotation ruler for perfect alignment.

### 📱 Mobile-First Design & Native Optimization
- **Premium Aesthetics**: Vibrant dark/light modes, glassmorphism UI elements, smooth micro-animations, and custom typography (Inter, Outfit).
- **Hilt-powered Dependency Injection**: Clean, scalable MVVM architecture with proper separation of concerns.
- **Lifecycle-aware TTS & PDF Engines**: All bitmap manipulations and rendering are offloaded using Kotlin Coroutines on `Dispatchers.IO`. Hardened for Android 14 with memory leak protection and resource recycling.

## 🛠 Technology Stack

- **Core**: Kotlin (Android Native Wrapper), Jetpack Compose (Material 3)
- **Frontend**: HTML5, Vanilla JavaScript (ES6+), CSS3
- **Styling**: Modern Vanilla CSS with HSL-based design systems
- **Engines**: 
  - **PDF.js**: Industry-standard PDF rendering.
  - **Tesseract.js**: Offline OCR engine.
  - **Fabric.js**: Advanced canvas-based annotation and shape manipulation.
  - **jsPDF**: Client-side PDF generation and export.
- **Architecture**: Hybrid WebView bridge for high-speed cross-platform performance.

## 📦 Project Structure

- `android/`: Native Android project container.
- `public/`: Core web application assets.
  - `index.html`: Main application entry point and UI logic.
  - `assets/`: 
    - `tesseract/`: Offline OCR worker and WASM files.
    - `fonts/`: Modern typography (Inter, Outfit).
- `README.md`: Project documentation.

## ⚙️ Configuration & Setup

### AI API Configuration
To unlock the full power of OmniReader's AI features, configure your API keys directly in the **AI Tools** menu within the application. OmniReader supports:
- Google Gemini API
- OpenAI API (GPT-4o mini)
- Anthropic Claude API
- DeepSeek API
- Local Ollama Endpoints (for privacy-focused local processing)

### 🔌 Local Ollama Setup Checklist
To use local Ollama models (e.g., `llama3`) for offline/private processing on your Android device:
1. **Bind to All Network Interfaces**: Start Ollama on your PC with the `OLLAMA_HOST` environment variable set to `0.0.0.0:11434`.
   - On Windows (PowerShell):
     ```powershell
     $env:OLLAMA_HOST="0.0.0.0:11434"
     ollama serve
     ```
2. **Network Connection**: Ensure your Android device and your PC are connected to the **same Wi-Fi network**.
3. **Configure Firewall**: Allow incoming traffic on port `11434` through your PC's firewall.
4. **Enter PC IP Address**: In the OmniReader AI configuration, input your PC's local IP address (e.g., `http://192.168.1.50:11434`) as the Ollama endpoint.

---

Developed with ❤️ by **Sarfaraz Shaikh**
*Transforming the way the world reads.*
