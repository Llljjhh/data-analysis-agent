"""
rag.py —— 极简 RAG
Embedding: 阿里云 DashScope text-embedding-v3
向量库: 纯 numpy + pickle 持久化
"""
import os
import json
import numpy as np
from pathlib import Path
from typing import List, Dict, Any

from openai import OpenAI


class SimpleRAG:
    """极简本地向量库"""

    def __init__(self, api_key: str, base_url: str, model: str = "text-embedding-v3",
                 persist_dir: str = "workspace/vector_store"):
        self.client = OpenAI(api_key=api_key, base_url=base_url)
        self.model = model
        self.persist_dir = Path(persist_dir)
        self.persist_dir.mkdir(parents=True, exist_ok=True)

        self.docs_file = self.persist_dir / "docs.json"
        self.vec_file = self.persist_dir / "vectors.npy"

        self.documents: List[Dict[str, str]] = []   # [{"text":..., "source":...}]
        self.vectors: np.ndarray | None = None      # (N, dim)

        self._load()

    # ---------- 持久化 ----------
    def _load(self):
        if self.docs_file.exists() and self.vec_file.exists():
            try:
                with open(self.docs_file, "r", encoding="utf-8") as f:
                    self.documents = json.load(f)
                self.vectors = np.load(self.vec_file)
                print(f"[RAG] 已加载 {len(self.documents)} 个知识片段", flush=True)
            except Exception as e:
                print(f"[RAG] 加载失败，重置: {e}", flush=True)
                self.documents = []
                self.vectors = None

    def _save(self):
        with open(self.docs_file, "w", encoding="utf-8") as f:
            json.dump(self.documents, f, ensure_ascii=False, indent=2)
        if self.vectors is not None:
            np.save(self.vec_file, self.vectors)

    # ---------- Embedding ----------
    def _embed(self, texts: List[str]) -> np.ndarray:
        """调 embedding API，返回 L2 归一化后的向量"""
        # DashScope embedding 单次最多 25 条
        all_vecs = []
        for i in range(0, len(texts), 25):
            batch = texts[i:i + 25]
            resp = self.client.embeddings.create(model=self.model, input=batch)
            vecs = np.array([d.embedding for d in resp.data], dtype=np.float32)
            all_vecs.append(vecs)
        vectors = np.vstack(all_vecs)

        # L2 归一化，之后点积 = 余弦相似度
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        norms[norms == 0] = 1
        return vectors / norms

    # ---------- 写入 ----------
    def add_text(self, text: str, source: str = "unknown",
                 chunk_size: int = 500, overlap: int = 50) -> int:
        """把长文本切分成 chunk 并加入向量库"""
        chunks = []
        start = 0
        while start < len(text):
            end = min(start + chunk_size, len(text))
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            start += chunk_size - overlap

        if not chunks:
            return 0

        print(f"[RAG] 正在 embedding {len(chunks)} 个片段（来源: {source}）...", flush=True)
        new_vectors = self._embed(chunks)

        for chunk in chunks:
            self.documents.append({"text": chunk, "source": source})

        if self.vectors is None:
            self.vectors = new_vectors
        else:
            self.vectors = np.vstack([self.vectors, new_vectors])

        self._save()
        return len(chunks)

    # ---------- 检索 ----------
    def search(self, query: str, top_k: int = 3, min_score: float = 0.3) -> List[Dict[str, Any]]:
        """检索最相关的 top_k 个片段"""
        if not self.documents or self.vectors is None:
            return []

        query_vec = self._embed([query])             # (1, dim)
        scores = (self.vectors @ query_vec.T).flatten()

        top_indices = np.argsort(scores)[::-1][:top_k]
        results = []
        for idx in top_indices:
            score = float(scores[idx])
            if score < min_score:
                continue
            results.append({
                "text": self.documents[idx]["text"],
                "source": self.documents[idx]["source"],
                "score": round(score, 3),
            })
        return results

    # ---------- 维护 ----------
    def clear(self):
        self.documents = []
        self.vectors = None
        if self.docs_file.exists():
            self.docs_file.unlink()
        if self.vec_file.exists():
            self.vec_file.unlink()

    def count(self) -> int:
        return len(self.documents)


# 全局单例（懒加载）
_rag_instance: SimpleRAG | None = None


def get_rag() -> SimpleRAG:
    """获取全局 RAG 实例"""
    global _rag_instance
    if _rag_instance is None:
        api_key = os.getenv("DASHSCOPE_API_KEY")
        base_url = os.getenv("DASHSCOPE_BASE_URL")
        model = os.getenv("DASHSCOPE_EMBEDDING_MODEL", "text-embedding-v3")
        if not api_key:
            raise RuntimeError("未配置 DASHSCOPE_API_KEY")
        _rag_instance = SimpleRAG(api_key, base_url, model)
    return _rag_instance