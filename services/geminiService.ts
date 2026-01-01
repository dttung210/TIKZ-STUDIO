import { GoogleGenAI } from "@google/genai";
import { TIKZ_SNIPPETS_CONTEXT } from "../constants";

// ============================================================================
// CẤU HÌNH MODEL GEMINI 3.0 (MỚI NHẤT)
// Thầy Tùng lưu ý: Hãy kiểm tra chính xác tên Model ID trong Google AI Studio
// ============================================================================
const PRO_MODEL = "gemini-3.0-pro";   // Model tư duy sâu (hoặc gemini-3.0-pro-001)
const FAST_MODEL = "gemini-3.0-flash"; // Model tốc độ cao (hoặc gemini-3.0-flash-001)

// Lấy API Key từ Vercel
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const SYSTEM_INSTRUCTION = `
Bạn là một chuyên gia LaTeX và TikZ. 
Quy tắc:
1. Hình học phẳng: BẮT BUỘC dùng NÉT LIỀN (solid lines).
2. Hình học không gian: Nét đứt cho cạnh khuất.
3. Chỉ trả về mã code trong môi trường tikzpicture.
`;

const extractTikz = (text: string) => {
  const match = text.match(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/);
  return match ? match[0] : text.replace(/```latex|```tikz|```/g, '').trim();
};

const extractSvg = (text: string) => {
  const clean = text.trim();
  const start = clean.indexOf('<svg');
  const end = clean.lastIndexOf('</svg>');
  if (start === -1) return "";
  if (end === -1) return clean.substring(start);
  return clean.substring(start, end + 6);
};

// Hàm lấy Client an toàn và log lỗi nếu thiếu Key
const getAIClient = () => {
  if (!API_KEY) {
    console.error("❌ LỖI NGHIÊM TRỌNG: Không tìm thấy API Key!");
    throw new Error("Chưa cấu hình VITE_GEMINI_API_KEY trên Vercel.");
  }
  return new GoogleGenAI({ apiKey: API_KEY });
};

export const generateTikzFromDescription = async (description: string, deepReason: boolean = false): Promise<string> => {
  try {
    const ai = getAIClient();
    
    // Cấu hình cho Gemini 3.0
    const config: any = {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: deepReason ? 0.3 : 0.1, // Gemini 3.0 thông minh nên có thể tăng độ sáng tạo
    };

    // Nếu Gemini 3.0 hỗ trợ Thinking (Tư duy), bật nó lên
    if (deepReason) {
       // Thầy có thể bỏ comment dòng dưới nếu model 3.0 hỗ trợ thinkingConfig
       // config.thinkingConfig = { thinkingBudget: 1024 }; 
    }

    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: `Context Snippets:\n${TIKZ_SNIPPETS_CONTEXT}\n\nYêu cầu: Hãy tạo mã TikZ cho mô tả sau: ${description}.`,
      config
    });
    
    if (!response.text) throw new Error("AI không trả về kết quả.");
    return extractTikz(response.text);

  } catch (error: any) {
    console.error("❌ LỖI API (TikZ):", error);
    
    // Phân tích lỗi giúp thầy Tùng dễ xử lý
    if (error.toString().includes("404")) {
        console.error(`⚠️ LỖI 404: Tên model "${PRO_MODEL}" không tồn tại hoặc tài khoản chưa được cấp quyền.`);
        console.error("👉 Thầy hãy vào Google AI Studio kiểm tra lại tên Model ID chính xác.");
    } else if (error.toString().includes("400")) {
        console.error("⚠️ LỖI 400: Yêu cầu không hợp lệ (thường do sai cấu hình config).");
    }
    
    throw error;
  }
};

export const generateDescriptionFromImage = async (base64Image: string): Promise<string> => {
  try {
    const ai = getAIClient();
    const match = base64Image.match(/^data:(.+);base64,(.+)$/);
    if (!match) throw new Error("Ảnh lỗi format");

    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: {
        parts: [
          { inlineData: { mimeType: match[1], data: match[2] } },
          { text: "Mô tả hình học của ảnh này để vẽ lại bằng TikZ:" }
        ]
      }
    });
    return response.text || "";
  } catch (error) {
    console.error("❌ Lỗi đọc ảnh:", error);
    throw error;
  }
};

export const generateSvgFromTikz = async (
  tikzCode: string, 
  deepReason: boolean = false, 
  onChunk?: (chunk: string) => void
): Promise<string> => {
  try {
    const ai = getAIClient();
    const prompt = `Convert this TikZ code to SVG. Return ONLY the <svg> code. No markdown.\nCode:\n${tikzCode}`;
    
    // Dùng model Flash cho nhanh
    if (onChunk) {
      const result = await ai.models.generateContentStream({
        model: FAST_MODEL,
        contents: prompt
      });
      let full = "";
      for await (const chunk of result) {
        full += chunk.text;
        const svg = extractSvg(full);
        if (svg) onChunk(svg);
      }
      return extractSvg(full);
    } else {
      const response = await ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt
      });
      return extractSvg(response.text || "");
    }
  } catch (error) {
    console.error("❌ Lỗi vẽ SVG:", error);
    throw error;
  }
};

export const generateTikzFromImage = async (base64Image: string, deepReason: boolean = false): Promise<string> => {
  try {
    const ai = getAIClient();
    const match = base64Image.match(/^data:(.+);base64,(.+)$/);
    if (!match) throw new Error("Ảnh lỗi");

    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: {
        parts: [
          { inlineData: { mimeType: match[1], data: match[2] } },
          { text: "Xuất mã TikZ cho hình này. Chỉ trả về code." }
        ]
      }
    });
    return extractTikz(response.text || "");
  } catch (error) {
    console.error("❌ Lỗi ảnh sang TikZ:", error);
    throw error;
  }
};
