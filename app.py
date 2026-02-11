import gradio as gr
import json
import os
import requests
import re
from typing import List, Dict, Any, Optional, Tuple

# Configuration
WORLD_TEMPLATE_PATH = os.path.join("src", "world_template", "Warhammer40k_Callisys.json")

# --- Logic & Helper Classes ---

class WorldManager:
    def __init__(self, template_path: str):
        self.cards: Dict[str, Any] = {}
        self.active_chapter_id: Optional[str] = None
        self.active_character_ids: List[str] = []
        self.load_world(template_path)

    def load_world(self, path: str):
        if not os.path.exists(path):
            print(f"Warning: World template not found at {path}")
            return
        
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            # Parse entries
            if 'entries' in data:
                # Handle different card types
                for card in data['entries'].get('setting_cards', []):
                    self.cards[card['id']] = card
                for card in data['entries'].get('character_cards', []):
                    self.cards[card['id']] = card
                for card in data['entries'].get('chapter_cards', []):
                    self.cards[card['id']] = card
                    if card.get('status') == 'active':
                        self.active_chapter_id = card['id']
                
                # Set initial active characters (simplified: take first 2)
                chars = [c for c in self.cards.values() if c.get('type') == 'character']
                if chars:
                    self.active_character_ids = [c['id'] for c in chars[:2]]
                    
        except Exception as e:
            print(f"Error loading world: {e}")

    def get_snapshot(self, active_char_ids: List[str]):
        active_chapter = self.cards.get(self.active_chapter_id) if self.active_chapter_id else None
        
        active_chars = []
        inactive_chars = []
        
        for cid, card in self.cards.items():
            if card.get('type') == 'character':
                if cid in active_char_ids:
                    active_chars.append(card)
                else:
                    inactive_chars.append({"id": cid, "name": card.get('name', 'Unknown')})
                    
        settings = [c for c in self.cards.values() if c.get('type') == 'setting']
        
        return {
            "activeChapter": active_chapter,
            "activeCharacters": active_chars,
            "inactiveCharacters": inactive_chars,
            "settings": settings
        }

    def get_all_cards_summary(self):
        return [f"- [{c.get('type', 'unknown')}] {c.get('title') or c.get('name') or 'Unknown'} (ID: {c['id']})" 
                for c in self.cards.values()]

class AIService:
    @staticmethod
    def call_chat(api_key: str, base_url: str, messages: List[Dict], model: str = "gpt-3.5-turbo"):
        if not api_key or not base_url:
            raise ValueError("API Key and Base URL are required.")
            
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": model,
            "messages": messages,
            "temperature": 0.7
        }
        
        try:
            response = requests.post(f"{base_url}/chat/completions", headers=headers, json=payload, timeout=60)
            response.raise_for_status()
            return response.json()['choices'][0]['message']['content']
        except Exception as e:
            return f"Error: {str(e)}"

class NarrativeEngine:
    @staticmethod
    def format_history(history: List[List[str]]) -> str:
        # Reverted to Tuple Format: [[user_msg, bot_msg], ...]
        formatted = ""
        for user_msg, bot_msg in history:
            if user_msg:
                formatted += f"[USER]: {user_msg}\n"
            if bot_msg:
                formatted += f"[ASSISTANT]: {bot_msg}\n"
        return formatted

    @staticmethod
    def construct_discovery_prompt(user_input: str, history_str: str, world_mgr: WorldManager):
        snapshot = world_mgr.get_snapshot(world_mgr.active_character_ids)
        index = "\n".join(world_mgr.get_all_cards_summary())
        
        active_chapter_text = f"{snapshot['activeChapter']['title']} (ID: {snapshot['activeChapter']['id']})" if snapshot['activeChapter'] else 'None'
        active_chars_text = ", ".join([f"{c['name']} (ID: {c['id']})" for c in snapshot['activeCharacters']])
        
        return f"""
# Role
You are the "Librarian" of the Oort world database. Your job is to identify which World Cards are relevant to the user's latest input and the current context.

# Task
1. Analyze the User Input and Recent History.
2. Review the "World Index" below.
3. Return a JSON object listing the IDs of the cards you need to read in detail to generate a narrative response.

# Context
## Active Chapter
{active_chapter_text}

## Active Characters
{active_chars_text}

## Recent History
{history_str}

## User Input
{user_input}

# World Index
{index}

# Response Format (JSON Only)
{{
  "needed_card_ids": ["id_1", "id_2"]
}}
"""

    @staticmethod
    def construct_narrative_prompt(user_input: str, history_str: str, world_mgr: WorldManager, needed_ids: List[str]):
        snapshot = world_mgr.get_snapshot(world_mgr.active_character_ids)
        
        # Fetch needed cards
        supp_context = "## Referenced Knowledge\n"
        for cid in needed_ids:
            card = world_mgr.cards.get(cid)
            if card:
                supp_context += f"### [{card.get('type')}] {card.get('title') or card.get('name')} (ID: {card['id']})\n"
                supp_context += json.dumps(card, ensure_ascii=False) + "\n"

        # Build Context
        world_context = "## Settings (Global Rules)\n"
        for s in snapshot['settings']:
            world_context += f"- {s.get('title')} ({s.get('category')}): {s.get('content')}\n"
            
        if snapshot['activeChapter']:
            c = snapshot['activeChapter']
            world_context += f"\n## Current Chapter: {c.get('title')}\n"
            world_context += f"Objective: {c.get('objective')}\n"
            world_context += f"Summary: {c.get('summary')}\n"
            
        char_context = "## Active Characters\n"
        for c in snapshot['activeCharacters']:
            char_context += f"### {c.get('name')} (ID: {c['id']})\n"
            char_context += f"Race: {c.get('race')}, Class: {c.get('class')}\n"
            char_context += f"Attributes: {json.dumps(c.get('attributes'))}\n"
            char_context += f"Status: {c.get('status')}\n"

        return f"""
# Role
You are the Game Master (GM) for the dark fantasy world.
Your goal is to weave a compelling narrative involving gods, magic, and destiny.

# World Context
{world_context}

{char_context}

{supp_context}

# History
{history_str}

# Instruction
1. Respond to the User Input as the GM.
2. Use the provided "Referenced Knowledge" to ensure accuracy.
3. PROACTIVE STORYTELLING: Drive the narrative forward.
4. Language: **Chinese (Simplified)**.

# Response Format
You MUST respond with a valid JSON object.
{{
  "sequence": [
    {{ "type": "environment", "content": "Description..." }},
    {{ "type": "dialogue", "speaker_name": "Name", "content": "Speech..." }}
  ],
  "interaction": {{ "needs_roll": false }},
  "world_updates": []
}}

[USER INPUT]: {user_input}
"""

    @staticmethod
    def parse_response(text: str):
        try:
            # Try to find JSON block
            match = re.search(r'```json\s*([\s\S]*?)\s*```', text)
            if match:
                return json.loads(match.group(1))
            match = re.search(r'\{[\s\S]*\}', text)
            if match:
                return json.loads(match.group(0))
            return None
        except:
            return None

# --- Main App ---

# Initialize World Manager
wm = WorldManager(WORLD_TEMPLATE_PATH)

def format_narrative(json_data):
    if not json_data or 'sequence' not in json_data:
        return "Error: Could not parse AI response."
    
    output = ""
    for item in json_data['sequence']:
        if item['type'] == 'environment':
            output += f"🌍 **环境**: {item['content']}\n\n"
        elif item['type'] == 'dialogue':
            output += f"🗣️ **{item['speaker_name']}**: {item['content']}\n\n"
            
    if json_data.get('interaction', {}).get('needs_roll'):
        output += "\n🎲 **需要检定**: GM 提示需要进行骰子检定。\n"
        
    return output

def game_loop(message, history, api_key, base_url, model_name):
    # Initialize history if None
    if history is None:
        history = []
        
    if not api_key or not base_url:
        history.append([message, "⚠️ 请先在侧边栏输入 API Key 和 Base URL。"])
        yield history, history
        return

    # 1. Update User Message with Placeholder
    # history format: [[user, bot], ...]
    # Append [message, None] to show typing animation if supported, or just a loading text
    history.append([message, "🔍 正在检索世界知识..."])
    yield history, history
    
    # 2. Format History (exclude the last item which is the current turn placeholder)
    # We take history[:-1] because the last item is the current turn we just added
    history_str = NarrativeEngine.format_history(history[:-1][-5:]) # Last 5 completed turns
    
    # 3. Discovery Step (Dual Request - Step 1)
    try:
        discovery_prompt = NarrativeEngine.construct_discovery_prompt(message, history_str, wm)
        
        discovery_res = AIService.call_chat(api_key, base_url, [{"role": "user", "content": discovery_prompt}], model_name)
        needed_ids = []
        try:
            # Try parse discovery JSON
            d_json = NarrativeEngine.parse_response(discovery_res)
            if d_json:
                needed_ids = d_json.get('needed_card_ids', [])
        except:
            pass # Fallback to no extra cards
            
        # 4. Narrative Step (Dual Request - Step 2)
        # Update placeholder to show next step
        history[-1][1] = "🎲 正在生成剧情..."
        yield history, history

        narrative_prompt = NarrativeEngine.construct_narrative_prompt(message, history_str, wm, needed_ids)
        
        narrative_res = AIService.call_chat(api_key, base_url, [{"role": "user", "content": narrative_prompt}], model_name)
        
        n_json = NarrativeEngine.parse_response(narrative_res)
        
        if n_json:
            final_text = format_narrative(n_json)
        else:
            final_text = f"⚠️ 解析失败 (Raw): {narrative_res}"
            
        # Update the final response in the tuple
        history[-1][1] = final_text
        yield history, history
        
    except Exception as e:
        history[-1][1] = f"❌ 系统错误: {str(e)}"
        yield history, history

# --- UI Layout ---

with gr.Blocks(title="Faramita Worlds Demo") as demo:
    gr.Markdown("# 彼岸·绘世行纪 Faramita Explore Worlds")
    
    with gr.Tabs():
        # Tab 1: Project Description
        with gr.Tab("项目说明"):
            gr.Markdown("""
            ## 关于 Faramita Worlds
            Faramita Worlds 是一个基于 Electron + Vue3 + TypeScript 构建的 AI 驱动跑团（TRPG）辅助工具。
            
            ### 核心特性
            - **沉浸式叙事**: 通过 AI 实时生成剧情、对话与环境描述。
            - **世界书系统**: 结构化的世界设定管理（World Cards），支持动态检索与注入。
            - **规则引擎**: 内置骰子系统与检定逻辑（D20 等）。
            - **本地优先**: 所有数据存储在本地 SQLite/IndexedDB，保障隐私。
            
            ### 开源地址
            [GitHub: Nobeta-Work/faramita-worlds](https://github.com/Nobeta-Work/faramita-worlds)

            本项目旨在探索 LLM 在长文本叙事与复杂规则交互下的潜力。
            """)
            
        # Tab 2: Why Simple Demo
        with gr.Tab("部署说明"):
            gr.Markdown("""
            ## 为什么这是一个简化 Demo？
            
            Faramita Worlds 的完整版本是一个 **桌面端应用 (Electron)**，依赖于本地文件系统、SQLite 数据库以及复杂的 Vue 前端交互（如 3D 骰子动画、动态气泡 UI）。
            
            ModelScope 的 Web 空间环境更适合运行 Python/Gradio 应用。因此，我们提取了项目的 **核心逻辑**（世界书结构 + AI 双重请求协议），构建了这个纯文本交互的 Demo。
            
            ### Demo 保留的功能
            1. **Warhammer 40k 世界书**: 预加载了战锤 40k 的设定数据。
            2. **双重请求机制 (Dual Request)**: 模拟了 "Discovery (检索)" -> "Narrative (生成)" 的 AI 思考链。
            3. **结构化输出**: 展示 AI 如何以 JSON 格式输出剧情、对话与环境。
            
            ### 缺失的功能
            - 存档/读档系统
            - 3D 骰子动画
            - 复杂的卡片编辑器 UI
            - 本地数据库持久化
            """)
            
        # Tab 3: Core Logic Demo
        with gr.Tab("完整功能演示"):
            with gr.Row():
                with gr.Column(scale=1):
                    gr.Markdown("### ⚙️ 设置")
                    api_key = gr.Textbox(
                        label="API Key", 
                        value=os.environ.get("MS_KEY", ""), 
                        type="password", 
                        placeholder="环境变量 MS_KEY 已自动加载"
                    )
                    base_url = gr.Textbox(
                        label="Base URL", 
                        value="https://api-inference.modelscope.cn/v1", 
                        placeholder="https://api-inference.modelscope.cn/v1"
                    )
                    model_name = gr.Textbox(
                        label="Model", 
                        value="ZhipuAI/GLM-4.7-Flash"
                    )
                    
                    gr.Markdown("### 📖 世界书概览 (JSON)")
                    # Display a part of the world book
                    world_viewer = gr.JSON(value=wm.cards, label="Current World Data (Read-only)")
                    
                with gr.Column(scale=2):
                    # REMOVED type="messages" to support older Gradio versions
                    chatbot = gr.Chatbot(label="Faramita Narrative Engine", height=600)
                    msg = gr.Textbox(label="你的行动", placeholder="输入你的行动，例如：'我环顾四周，寻找是否有可疑的人。'")
                    with gr.Row():
                        submit_btn = gr.Button("发送", variant="primary")
                        clear_btn = gr.Button("清除历史")
                        
            # State
            state_history = gr.State([])
            
            # Events
            submit_btn.click(
                game_loop, 
                inputs=[msg, state_history, api_key, base_url, model_name], 
                outputs=[chatbot, state_history]
            )
            msg.submit(
                game_loop, 
                inputs=[msg, state_history, api_key, base_url, model_name], 
                outputs=[chatbot, state_history]
            )
            clear_btn.click(lambda: ([], []), None, [chatbot, state_history])

        # Tab 4: Resources
        with gr.Tab("资源演示"):
            gr.Markdown("### 演示视频与图片")
            
            # Helper to find resources
            def get_resource_path(name):
                return os.path.join("resources", name)
                
            with gr.Row():
                with gr.Column():
                    gr.Markdown("#### 演示视频")
                    # Assuming file exists
                    if os.path.exists("resources/演示demo.mp4"):
                        gr.Video("resources/演示demo.mp4")
                    else:
                        gr.Markdown("*视频文件未找到*")
                        
                with gr.Column():
                    gr.Markdown("#### 界面截图")
                    gallery_files = []
                    for f in ["faramita.png", "演示图片1.png"]:
                        p = get_resource_path(f)
                        if os.path.exists(p):
                            gallery_files.append(p)
                            
                    if gallery_files:
                        gr.Gallery(gallery_files, label="App Screenshots")
                    else:
                        gr.Markdown("*图片文件未找到*")

if __name__ == "__main__":
    demo.queue().launch(server_name="0.0.0.0", server_port=7860)
