import gradio as gr
import os
import json
import random
import re
from typing import List, Dict, Any

MS_KEY = os.environ.get("MS_KEY", "")
BASE_URL = os.environ.get("BASE_URL", "https://api-inference.modelscope.cn/v1")
MODEL = os.environ.get("MODEL", "ZhipuAI/GLM-4.7-Flash")

DEFAULT_WORLD = "Warhammer40k_Callisys"

world_templates = {}

def load_world_templates():
    global world_templates
    template_dir = os.path.join(os.path.dirname(__file__), "src", "world_template")
    if not os.path.exists(template_dir):
        template_dir = "src/world_template"
    if not os.path.exists(template_dir):
        template_dir = "."
    
    for filename in os.listdir(template_dir):
        if filename.endswith(".json"):
            filepath = os.path.join(template_dir, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    world_data = json.load(f)
                    world_name = world_data.get("world_meta", {}).get("name", filename)
                    world_templates[world_name] = world_data
            except Exception as e:
                print(f"Error loading {filename}: {e}")

load_world_templates()

def build_system_prompt(world_data: Dict) -> str:
    meta = world_data.get("world_meta", {})
    name = meta.get("name", "未知世界")
    description = meta.get("description", "")
    
    entries = world_data.get("entries", {})
    settings = entries.get("setting_cards", [])
    chapters = entries.get("chapter_cards", [])
    characters = entries.get("character_cards", [])
    
    prompt = f"""# Role
你是{name}的({description})游戏主持人(GM)。
你的目标是编织一个引人入胜的叙事。

# World Context
{description}

"""
    
    visible_settings = [s for s in settings if s.get("visible", {}).get("public_visible", False) or s.get("visible", {}).get("player_visible", False)]
    if visible_settings:
        prompt += "## 世界设定\n"
        for setting in visible_settings[:10]:
            title = setting.get("title", "")
            category = setting.get("category", "")
            content = setting.get("content", "")
            prompt += f"- **{title}** ({category}): {content[:200]}...\n"
        prompt += "\n"
    
    active_chapter = [c for c in chapters if c.get("status") == "active"]
    if active_chapter:
        chapter = active_chapter[0]
        prompt += f"## 当前章节: {chapter.get('title', '')}\n"
        prompt += f"目标: {chapter.get('objective', '')}\n"
        prompt += f"简介: {chapter.get('summary', '')}\n\n"
    
    visible_chars = [c for c in characters if c.get("visible", {}).get("public_visible", False) or c.get("visible", {}).get("player_visible", False)]
    if visible_chars:
        prompt += "## 角色\n"
        for char in visible_chars[:5]:
            name = char.get("name", "")
            race = ", ".join(char.get("race", []))
            char_class = char.get("class", "")
            level = char.get("level", 1)
            status = ", ".join(char.get("status", []))
            prompt += f"- **{name}** ({race} {char_class}, Lv.{level}) - 状态: {status}\n"
        prompt += "\n"
    
    prompt += """# Rules
1. 使用生动、感官丰富的描述（视觉、声音、气味）。
2. 保持与设定一致的世界观基调。
3. 用中文回复。

# Interaction System
- 如果需要投骰，使用 [[XdY+Z]] 格式（例如：[[1d20+5]]）
- 玩家输入 "掷骰" 或 "roll" 时，自动投掷 D20

# Response Format
直接输出叙事内容，不需要JSON格式。
"""
    
    return prompt

def parse_roll(formula: str) -> Dict[str, Any]:
    match = re.match(r"(\d+)d(\d+)\s*([\+\-])\s*(\d+)", formula, re.IGNORECASE)
    if not match:
        return {"formula": formula, "error": "无效的掷骰公式"}
    
    count = int(match.group(1))
    sides = int(match.group(2))
    operator = match.group(3)
    bonus = int(match.group(4))
    
    dice_results = [random.randint(1, sides) for _ in range(count)]
    total = sum(dice_results)
    if operator == '+':
        total += bonus
    
    return {
        "formula": formula,
        "dice_results": dice_results,
        "bonus": bonus if operator == '+' else -bonus,
        "total": total
    }

def roll_d20() -> Dict[str, Any]:
    result = random.randint(1, 20)
    return {
        "formula": "1d20",
        "dice_results": [result],
        "bonus": 0,
        "total": result
    }

def format_roll_result(result: Dict[str, Any]) -> str:
    if "error" in result:
        return f"掷骰错误: {result['error']}"
    
    dice_str = ", ".join(map(str, result["dice_results"]))
    bonus_str = f" + {result['bonus']}" if result['bonus'] > 0 else f" - {abs(result['bonus'])}" if result['bonus'] < 0 else ""
    
    return f"🎲 {result['formula']}\n结果: [{dice_str}]{bonus_str} = **{result['total']}**"

def extract_rolls(text: str) -> List[str]:
    return re.findall(r"\[\[(.+?)\]\]", text)

def call_api(messages: List[Dict[str, str]]) -> str:
    if not MS_KEY:
        return "错误: 未设置 MS_KEY 环境变量，请在部署平台配置。"
    
    import httpx
    
    headers = {
        "Authorization": f"Bearer {MS_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": MODEL,
        "messages": messages,
        "stream": False
    }
    
    try:
        with httpx.Client(timeout=120.0) as client:
            response = client.post(f"{BASE_URL}/chat/completions", headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        return f"API 错误: {str(e)}"

def faramita_chat(message: str, history_state: List[List[str]], world_name: str) -> str:
    global world_templates
    
    if not world_name or world_name == "默认":
        world_name = DEFAULT_WORLD
    
    current_prompt = build_system_prompt(world_templates.get(world_name, {})) if world_name in world_templates else ""
    
    message = message.strip()
    if not message:
        return ""
    
    rolls = extract_rolls(message)
    if rolls:
        for roll_formula in rolls:
            result = parse_roll(roll_formula)
            return f"🎲 掷骰结果:\n{format_roll_result(result)}"
    
    if message.lower() in ["掷骰", "roll", "d20"]:
        result = roll_d20()
        return f"🎲 D20 掷骰结果:\n{format_roll_result(result)}"
    
    messages = [{"role": "system", "content": current_prompt}]
    
    # 确保历史记录格式正确
    for h in history_state[-10:]:
        if isinstance(h, (list, tuple)) and len(h) >= 2:
            # 确保内容是字符串
            user_content = str(h[0]) if h[0] is not None else ""
            assistant_content = str(h[1]) if h[1] is not None else ""
            
            if user_content.strip():
                messages.append({"role": "user", "content": user_content})
            if assistant_content.strip():
                messages.append({"role": "assistant", "content": assistant_content})
        elif isinstance(h, dict) and "role" in h and "content" in h:
            # 如果已经是正确的消息格式
            messages.append(h)
    
    messages.append({"role": "user", "content": message})
    
    # 验证消息格式
    validated_messages = []
    for msg in messages:
        if isinstance(msg, dict) and "role" in msg and "content" in msg:
            # 确保内容是字符串
            content = str(msg["content"]) if msg["content"] is not None else ""
            validated_messages.append({
                "role": str(msg["role"]),
                "content": content
            })
    
    if not validated_messages:
        return "错误: 消息格式无效"
    
    assistant_message = call_api(validated_messages)
    
    if assistant_message:
        ai_rolls = extract_rolls(assistant_message)
        for roll_formula in ai_rolls:
            result = parse_roll(roll_formula)
            assistant_message += f"\n\n{format_roll_result(result)}"
    
    return assistant_message

def clear_history():
    return [], ""

world_options = ["默认"] + list(world_templates.keys())

default_world_name = DEFAULT_WORLD if DEFAULT_WORLD in world_templates else ("默认" if world_options else "默认")

with gr.Blocks(title="Faramita Worlds - TRPG") as demo:
    gr.Markdown("# 🎭 Faramita Worlds - TRPG 世界")
    gr.Markdown("AI 驱动的多世界 TRPG 沙盒系统")
    
    with gr.Row():
        with gr.Column(scale=3):
            world_dropdown = gr.Dropdown(
                choices=world_options,
                value=default_world_name,
                label="选择世界",
                info="选择不同的世界模板，AI 将根据该世界的设定进行叙事"
            )
            
            chatbot = gr.Chatbot(label="编年史", height=400)
            
            with gr.Row():
                msg = gr.Textbox(label="输入指令", placeholder="输入你的行动或描述...", scale=5)
                clear_btn = gr.Button("清空", variant="secondary", scale=1)
        
        with gr.Column(scale=1):
            gr.Markdown("### 🎲 掷骰指令")
            gr.Markdown("""
            - 输入 `掷骰` 或 `roll` 掷 D20
            - 在文本中使用 `[[1d20+5]]` 请求 AI 掷骰
            
            ### 📖 可用世界
            - **默认/Warhammer40k**: 哥特式黑暗科幻（帝国、混沌、异形）
            
            当前世界设定将影响 AI 的叙事风格、世界观知识和角色设定。
            """)
            
            world_info = gr.Markdown("### 当前世界\n选择上方世界查看详情")
    
    def update_world_info(world_name: str) -> str:
        if world_name == "默认" or not world_name:
            world_name = DEFAULT_WORLD
        if world_name in world_templates:
            meta = world_templates[world_name].get("world_meta", {})
            desc = meta.get("description", "")
            return f"### 当前世界: {world_name}\n\n{desc}"
        return f"### 当前世界: {world_name}\n\n选择上方世界查看详情"
    
    def respond(message: str, history: List[List[str]], world_name: str) -> tuple:
        response = faramita_chat(message, history, world_name)
        history.append([message, response])
        return "", history
    
    world_dropdown.change(update_world_info, inputs=[world_dropdown], outputs=[world_info])
    msg.submit(respond, [msg, chatbot, world_dropdown], [msg, chatbot])
    clear_btn.click(lambda: ([], ""), outputs=[chatbot, msg])

if __name__ == "__main__":
    demo.launch(
        server_name="0.0.0.0",
        server_port=7860,
        css="""
            .gradio-container {max-width: 1200px !important}
            .chatbot {min-height: 450px}
        """
    )
