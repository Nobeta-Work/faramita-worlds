import gradio as gr
import json
import os
import re
from typing import List, Dict, Any, Optional
from openai import OpenAI

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
                for card in data['entries'].get('setting_cards', []):
                    self.cards[card['id']] = card
                for card in data['entries'].get('character_cards', []):
                    self.cards[card['id']] = card
                for card in data['entries'].get('chapter_cards', []):
                    self.cards[card['id']] = card
                    if card.get('status') == 'active':
                        self.active_chapter_id = card['id']
                
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
            
        client = OpenAI(
            base_url=base_url,
            api_key=api_key,
        )
        
        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.7
            )
            return response.choices[0].message.content
        except Exception as e:
            return f"Error: {str(e)}"

class NarrativeEngine:
    @staticmethod
    def format_history(history: List[Dict[str, str]]) -> str:
        """
        Formats history for the prompt.
        Expects strictly List[Dict] format: [{'role': 'user', 'content': '...'}, ...]
        """
        formatted = ""
        if not history:
            return formatted
            
        for item in history:
            if isinstance(item, dict):
                role = item.get('role')
                content = item.get('content')
                if role == 'user':
                    formatted += f"[USER]: {content}\n"
                elif role == 'assistant':
                    formatted += f"[ASSISTANT]: {content}\n"
        
        return formatted

    @staticmethod
    def construct_discovery_prompt(user_input: str, history_str: str, world_mgr: WorldManager):
        snapshot = world_mgr.get_snapshot(world_mgr.active_character_ids)
        index = "\n".join(world_mgr.get_all_cards_summary())
        
        active_chapter_text = f"{snapshot['activeChapter']['title']} (ID: {snapshot['activeChapter']['id']})" if snapshot['activeChapter'] else 'None'
        active_chars_text = ", ".join([f"{c['name']} (ID: {c['id']})" for c in snapshot['activeCharacters']])
        
        return f"""
# Role
You are the "Librarian" of the Oort world database.

# Task
Identify which World Cards are relevant to the user's latest input.
Return a JSON object listing the IDs of the cards you need to read.

# Context
Active Chapter: {active_chapter_text}
Active Characters: {active_chars_text}

# Recent History
{history_str}

# User Input
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
        
        supp_context = "## Referenced Knowledge\n"
        for cid in needed_ids:
            card = world_mgr.cards.get(cid)
            if card:
                supp_context += f"### [{card.get('type')}] {card.get('title') or card.get('name')} (ID: {card['id']})\n"
                supp_context += json.dumps(card, ensure_ascii=False) + "\n"

        world_context = "## Settings\n"
        for s in snapshot['settings']:
            world_context += f"- {s.get('title')}: {s.get('content')}\n"
            
        if snapshot['activeChapter']:
            c = snapshot['activeChapter']
            world_context += f"\n## Current Chapter: {c.get('title')}\n{c.get('summary')}\n"
            
        char_context = "## Active Characters\n"
        for c in snapshot['activeCharacters']:
            char_context += f"### {c.get('name')} (ID: {c['id']})\n"
            char_context += f"Attributes: {json.dumps(c.get('attributes'))}\n"

        return f"""
# Role
You are the Game Master (GM) for the dark fantasy world.

# World Context
{world_context}
{char_context}
{supp_context}

# History
{history_str}

# Instruction
1. Respond to the User Input as the GM.
2. Drive the narrative forward.
3. Language: **Chinese (Simplified)**.

# Response Format
You MUST respond with a valid JSON object.
{{
  "sequence": [
    {{ "type": "environment", "content": "Description..." }},
    {{ "type": "dialogue", "speaker_name": "Name", "content": "Speech..." }}
  ],
  "interaction": {{ "needs_roll": false }}
}}

[USER INPUT]: {user_input}
"""

    @staticmethod
    def parse_response(text: str):
        try:
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

def ensure_list_of_dicts(history) -> List[Dict[str, str]]:
    """
    Strictly enforce List[Dict] format.
    If any item is not a dict, try to convert or discard.
    """
    if history is None:
        return []
    
    sanitized = []
    for item in history:
        if isinstance(item, dict) and 'role' in item and 'content' in item:
            sanitized.append(item)
        # We purposely ignore tuples now to avoid any ambiguity
    return sanitized

def game_loop(message, history, api_key, base_url, model_name):
    # Enforce strict format
    history = ensure_list_of_dicts(history)
    
    if not api_key or not base_url:
        history.append({"role": "user", "content": message})
        history.append({"role": "assistant", "content": "⚠️ 请先在侧边栏输入 API Key 和 Base URL。"})
        yield history, history
        return

    # 1. Update User Message with Placeholder
    history.append({"role": "user", "content": message})
    history.append({"role": "assistant", "content": "🔍 正在检索世界知识..."})
    yield history, history
    
    # 2. Format History (Use all previous except the current turn placeholder)
    history_str = NarrativeEngine.format_history(history[:-2][-10:])
    
    # 3. Discovery Step
    try:
        discovery_prompt = NarrativeEngine.construct_discovery_prompt(message, history_str, wm)
        
        # Call AI using OpenAI SDK
        discovery_res = AIService.call_chat(
            api_key, 
            base_url, 
            [{"role": "user", "content": discovery_prompt}], 
            model_name
        )
        
        needed_ids = []
        try:
            d_json = NarrativeEngine.parse_response(discovery_res)
            if d_json:
                needed_ids = d_json.get('needed_card_ids', [])
        except:
            pass
            
        # 4. Narrative Step
        history[-1]['content'] = "🎲 正在生成剧情..."
        yield history, history

        narrative_prompt = NarrativeEngine.construct_narrative_prompt(message, history_str, wm, needed_ids)
        
        # Call AI using OpenAI SDK
        narrative_res = AIService.call_chat(
            api_key, 
            base_url, 
            [{"role": "user", "content": narrative_prompt}], 
            model_name
        )
        
        n_json = NarrativeEngine.parse_response(narrative_res)
        
        if n_json:
            final_text = format_narrative(n_json)
        else:
            final_text = f"⚠️ 解析失败 (Raw): {narrative_res}"
            
        history[-1]['content'] = final_text
        yield history, history
        
    except Exception as e:
        history[-1]['content'] = f"❌ 系统错误: {str(e)}"
        yield history, history

# --- UI Layout ---

with gr.Blocks(title="Faramita Worlds Demo") as demo:
    gr.Markdown("# 彼岸·绘世行纪 Faramita Explore Worlds")
    
    with gr.Tabs():
        with gr.Tab("完整功能演示"):
            with gr.Row():
                with gr.Column(scale=1):
                    gr.Markdown("### ⚙️ 设置")
                    api_key = gr.Textbox(
                        label="API Key", 
                        value=os.environ.get("MS_KEY", ""), 
                        type="password"
                    )
                    base_url = gr.Textbox(
                        label="Base URL", 
                        value="https://api-inference.modelscope.cn/v1"
                    )
                    model_name = gr.Textbox(
                        label="Model", 
                        value="ZhipuAI/GLM-4.7-Flash"
                    )
                    
                    gr.Markdown("Status: OpenAI SDK Enabled, Strict Messages Mode")
                    
                with gr.Column(scale=2):
                    # STRICTLY use type="messages"
                    chatbot = gr.Chatbot(label="Faramita Narrative Engine", height=600, type="messages")
                        
                    msg = gr.Textbox(label="你的行动", placeholder="输入你的行动...")
                    with gr.Row():
                        submit_btn = gr.Button("发送", variant="primary")
                        clear_btn = gr.Button("清除历史")
                        
            # State strictly for List[Dict]
            state_history = gr.State([])
            
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
            # Clear logic
            clear_btn.click(lambda: ([], []), None, [chatbot, state_history])

        with gr.Tab("项目说明"):
            gr.Markdown("""
            ## 关于 Faramita Worlds
            Faramita Worlds 是一个基于 Electron + Vue3 + TypeScript 构建的 AI 驱动跑团（TRPG）辅助工具。
            [GitHub: Nobeta-Work/faramita-worlds](https://github.com/Nobeta-Work/faramita-worlds)
            """)

        with gr.Tab("部署说明"):
            gr.Markdown("简化 Demo，仅保留 AI 核心逻辑。")

        with gr.Tab("资源演示"):
            gr.Markdown("### 演示视频与图片")
            def get_resource_path(name):
                return os.path.join("resources", name)
            
            with gr.Row():
                with gr.Column():
                    if os.path.exists("resources/演示demo.mp4"):
                        gr.Video("resources/演示demo.mp4")
                with gr.Column():
                    gallery_files = []
                    for f in ["faramita.png", "演示图片1.png"]:
                        p = get_resource_path(f)
                        if os.path.exists(p):
                            gallery_files.append(p)
                    if gallery_files:
                        gr.Gallery(gallery_files)

if __name__ == "__main__":
    demo.queue().launch(server_name="0.0.0.0", server_port=7860)
