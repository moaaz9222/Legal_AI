# ⚖️ Legal AI Assistant — المساعد القانوني الذكي

> A state-of-the-art **RAG (Retrieval-Augmented Generation)** application designed specifically for the **Egyptian Penal Code (قانون العقوبات المصري)**. It acts as an AI-powered legal assistant that can instantly answer complex legal questions, cite specific articles, and maintain conversational memory.

---

## ✨ Features / المميزات

- **📚 Deep Legal Knowledge:** Ingests and comprehends the entire 182-page Egyptian Penal Code.
- **🤖 Powered by Groq & LLaMA 3.3:** Delivers lightning-fast, highly accurate responses using the Groq API.
- **🧠 Semantic Search:** Uses Google Generative AI Embeddings to perfectly match user queries with the relevant legal context.
- **💬 Conversation Memory:** Remembers the context of the chat, allowing you to ask follow-up questions seamlessly.
- **⚡ Next.js Frontend:** A gorgeous, modern, and highly responsive user interface with glassmorphism effects and dark mode aesthetics.
- ** FastAPI Backend:** Robust, asynchronous backend powered by Python and LangChain.

---

## 🛠️ Tech Stack / التقنيات المستخدمة

### Frontend
- **Framework:** Next.js 14
- **Styling:** Vanilla CSS with custom CSS Variables & Glassmorphism
- **API Communication:** Server-Sent Events (SSE) for real-time streaming

### Backend
- **Framework:** FastAPI (Python)
- **RAG Pipeline:** LangChain & LangChain-Chroma
- **Vector Database:** ChromaDB (Local persistent storage)
- **Embeddings:** Google Generative AI Embeddings (`gemini-embedding-2`)
- **LLM Engine:** Groq API (`llama-3.3-70b-versatile`)
- **PDF Extraction:** PDFPlumber

---

## 🚀 Getting Started / كيفية التشغيل

### 1. Clone the repository
```bash
git clone https://github.com/your-username/legal-ai-assistant.git
cd legal-ai-assistant
```

### 2. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Set up your environment variables by creating a `.env` file:
   ```env
   GROQ_API_KEY=your_groq_api_key
   GOOGLE_API_KEY=your_google_api_key
   ```
4. Run the backend server (FastAPI):
   ```bash
   python -m uvicorn main:app --reload --port 8000
   ```
   *Note: On the first run, the backend will automatically parse the Penal Code PDF and build the vector database in chunks to respect API limits.*

### 3. Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open your browser and visit: `http://localhost:3000`

---

## 💡 Usage Example / مثال على الاستخدام

**User:** ما هي عقوبة السرقة في قانون العقوبات؟  
**Assistant:** يجيب بذكر المادة رقم 311 والمواد المرتبطة بها وشرح العقوبة المقررة.

**User:** (Follow-up) وهل هناك استثناءات؟  
**Assistant:** يتذكر السياق (السرقة) ويبحث عن أي استثناءات أو ظروف مخففة في القانون ويجيبك.

---

## 📝 License
This project is for educational and experimental purposes. The provided legal text is the Egyptian Penal Code, widely available in the public domain.

Made with ❤️ by Moaaz.
