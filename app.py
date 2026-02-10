import gradio as gr
import os
import json
import random
import re
from openai import OpenAI
from typing import List, Dict, Any

DEEPSEEK_KEY = os.environ.get("DEEPSEEK_KEY", "")
BASE_URL = os.environ.get("BASE_URL", "https://api.deepseek.com/v1")
MODEL = os.environ.get("MODEL", "deepseek-chat")

client = OpenAI(api_key=DEEPSEEK_KEY, base_url=BASE_URL)

history: List[Dict[str, str]] = []

SYSTEM_PROMPT = """# Role
你是奥尔特大陆(Oort)黑暗奇幻世界的游戏主持人(GM)。
你的目标是编织一个引人入胜的叙事，涉及神明、魔法和命运。

# World Context
奥尔特是一个被古老神明遗弃的世界，魔法与科技的残余在这个废土世界中交织。
冒险者们在这个危险的世界中探索遗迹，对抗怪物，寻找失落的知识。

# Rules
1. 使用生动、感官丰富的描述（视觉、声音、气味）。
2. 保持严肃、沉浸的黑暗奇幻基调。
3. 用中文回复。

# Interaction System
- 如果需要投骰，使用 [[XdY+Z]] 格式（例如：[[1d20+5]]）
- 玩家输入 "掷骰" 或 "roll" 时，自动投掷最近一次需要的骰子

# Response Format
直接输出叙事内容，不需要JSON格式。
"""

def parse_roll(formula: str) -> Dict[str, Any]:
    """解析并掷骰"""
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
    """掷D20"""
    result = random.randint(1, 20)
    return {
        "formula": "1d20",
        "dice_results": [result],
        "bonus": 0,
        "total": result
    }

def format_roll_result(result: Dict[str, Any]) -> str:
    """格式化掷骰结果"""
    if "error" in result:
        return f"掷骰错误: {result['error']}"
    
    dice_str = ", ".join(map(str, result["dice_results"]))
    bonus_str = f" + {result['bonus']}" if result['bonus'] > 0 else f" - {abs(result['bonus'])}" if result['bonus'] < 0 else ""
    
    return f"🎲 {result['formula']}\n结果: [{dice_str}]{bonus_str} = **{result['total']}**"

def extract_rolls(text: str) -> List[str]:
    """从文本中提取掷骰公式"""
    return re.findall(r"\[\[(.+?)\]\]", text)

def faramita_chat(message: str, history_state: List[List[str]]) -> str:
    """Faramita 聊天主函数"""
    global history
    
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
    
    history.append({"role": "user", "content": message})
    
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for h in history[-10:]:
        messages.append({"role": h["role"], "content": h["content"]})
    
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            stream=False
        )
        assistant_message = response.choices[0].message.content
        
        ai_rolls = extract_rolls(assistant_message)
        for roll_formula in ai_rolls:
            result = parse_roll(roll_formula)
            assistant_message += f"\n\n{format_roll_result(result)}"
        
        history.append({"role": "assistant", "content": assistant_message})
        
        return assistant_message
    
    except Exception as e:
        return f"错误: {str(e)}"

def clear_history():
    """清空历史"""
    global history
    history = []
    return "", []

with gr.Blocks(title="Faramita Worlds - 奥尔特大陆 TRPG", css="""
    .gradio-container {max-width: 1200px !important}
    .chatbot {min-height: 400px}
""") as demo:
    gr.Markdown("# 🎭 Faramita Worlds - 奥尔特大陆 TRPG")
    gr.Markdown("一个 AI 驱动的黑暗奇幻 TRPG 沙盒世界")
    
    with gr.Row():
        with gr.Column(scale=3):
            chatbot = gr.Chatbot(label="编年史", height=450, bubble_full_width=False)
            msg = gr.Textbox(label="输入指令", placeholder="输入你的行动或描述...")
            clear_btn = gr.Button("清空历史", variant="secondary")
        
        with gr.Column(scale=1):
            gr.Markdown("### 🎲 掷骰指令")
            gr.Markdown("""
            - 输入 `掷骰` 或 `roll` 掷 D20
            - 在文本中使用 `[[1d20+5]]` 请求 AI 掷骰
            
            ### 📖 世界设定
            奥尔特是一个被古老神明遗弃的黑暗奇幻世界。
            魔法与科技的残余在这个废土世界中交织，等待冒险者探索。
            """)
    
    def respond(message: str, history: List[List[str]]) -> tuple:
        response = faramita_chat(message, history)
        history.append([message, response])
        return "", history
    
    msg.submit(respond, [msg, chatbot], [msg, chatbot])
    clear_btn.click(lambda: ([], ""), outputs=[chatbot, msg])

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)
