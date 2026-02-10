import os
import json
import requests
import uuid
from typing import List, Dict, Any, Optional
import gradio as gr

# === 配置部分 ===
API_KEY = os.getenv("API_KEY")  # 从环境变量加载API KEY
BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"  # 默认使用通义千问
MODEL = "qwen-plus"

# 加载 Warhammer40k 世界书
def load_world_book():
    """加载固定的世界书内容"""
    world_book_path = os.path.join(os.path.dirname(__file__), "src", "world_template", "Warhammer40k_Callisys.json")
    try:
        with open(world_book_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        # 如果找不到文件，使用基础配置
        return {
            "world_meta": {
                "name": "Warhammer40k_Callisys",
                "description": "战锤40k宇宙，卡利西斯星区"
            },
            "entries": {
                "setting_cards": [],
                "character_cards": [],
                "chapter_cards": []
            }
        }

class SimpleAIService:
    """简化版 AI 服务"""
    
    def __init__(self):
        self.api_key = API_KEY
        self.base_url = BASE_URL
        self.model = MODEL
    
    def send_message(self, user_prompt: str, history: List[Dict]) -> str:
        """发送消息给AI"""
        if not self.api_key:
            return "错误: 未配置 API KEY，请设置环境变量 API_KEY"
        
        # 构建对话历史
        messages = []
        
        # 添加系统提示词（使用世界书内容构建）
        world_book = load_world_book()
        system_prompt = self._build_system_prompt(world_book)
        messages.append({"role": "system", "content": system_prompt})
        
        # 添加历史对话
        for entry in history:
            messages.append({
                "role": entry["role"],
                "content": entry["content"]
            })
        
        # 添加当前用户输入
        messages.append({"role": "user", "content": user_prompt})
        
        try:
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": self.model,
                    "messages": messages,
                    "stream": False
                },
                timeout=60
            )
            
            if response.status_code == 200:
                data = response.json()
                return data["choices"][0]["message"]["content"]
            else:
                return f"API调用失败: {response.status_code} - {response.text}"
                
        except Exception as e:
            return f"请求出错: {str(e)}"
    
    def _build_system_prompt(self, world_book: Dict) -> str:
        """构建系统提示词"""
        meta = world_book.get("world_meta", {})
        entries = world_book.get("entries", {})
        
        prompt = f"""你是一个专业的战锤40k宇宙游戏主持人(GM)。
        
世界背景: {meta.get('description', '战锤40k宇宙')}
        
请根据以下设定进行互动:
1. 使用中文回复
2. 保持战锤40k的黑暗科幻风格
3. 可以适当加入骰子检定机制，格式为 [[1d100]] 或 [[1d20+5]]
4. 推进剧情发展，不要让对话停滞
        
用户将扮演角色在这个世界中冒险，请给出沉浸式的回应。"""

        # 添加设置卡片
        settings = entries.get("setting_cards", [])
        if settings:
            prompt += "\n\n世界设定:\n"
            for setting in settings[:5]:  # 只取前5个避免过长
                if setting.get("visible", {}).get("public_visible", False):
                    prompt += f"- {setting.get('title', '')}: {setting.get('content', '')[:100]}...\n"
        
        # 添加角色信息
        characters = entries.get("character_cards", [])
        if characters:
            prompt += "\n\n初始角色:\n"
            for char in characters[:2]:
                prompt += f"- {char.get('name', '')} ({char.get('class', '')}, 等级{char.get('level', 1)})\n"
        
        return prompt

class DiceLogic:
    """骰子逻辑"""
    
    @staticmethod
    def parse_and_roll(formula: str) -> Dict[str, Any]:
        """解析并投掷骰子"""
        import random
        import re
        
        # 匹配格式: 1d20+5 或 2d6
        match = re.match(r'(\d+)d(\d+)([+-]\d+)?', formula.lower())
        if not match:
            return {"error": f"无效的骰子公式: {formula}"}
        
        count = int(match.group(1))
        sides = int(match.group(2))
        bonus = int(match.group(3)) if match.group(3) else 0
        
        # 投掷骰子
        results = [random.randint(1, sides) for _ in range(count)]
        total = sum(results) + bonus
        
        return {
            "formula": formula,
            "dice_results": results,
            "bonus": bonus,
            "total": total
        }

# === Gradio 应用 ===
ai_service = SimpleAIService()
chat_history = []  # 存储对话历史

def process_message(user_input: str) -> tuple[str, str]:
    """处理用户消息"""
    global chat_history
    
    if not user_input.strip():
        return "", format_chat_history()
    
    # 添加用户消息到历史
    chat_history.append({
        "role": "user",
        "content": user_input,
        "turn": len(chat_history) + 1
    })
    
    # 获取AI回复
    ai_response = ai_service.send_message(user_input, chat_history[:-1])  # 不包含刚添加的用户消息
    
    # 检查是否有骰子指令
    import re
    dice_matches = re.findall(r'\[\[(.*?)\]\]', ai_response)
    for formula in dice_matches:
        roll_result = DiceLogic.parse_and_roll(formula)
        if "error" not in roll_result:
            ai_response += f"\n\n🎲 投掷 {formula}: {roll_result['total']} (详情: {roll_result['dice_results']} + {roll_result['bonus']})"
    
    # 添加AI回复到历史
    chat_history.append({
        "role": "assistant",
        "content": ai_response,
        "turn": len(chat_history) + 1
    })
    
    return "", format_chat_history()

def format_chat_history() -> str:
    """格式化聊天历史为HTML显示"""
    if not chat_history:
        world_book = load_world_book()
        meta = world_book.get("world_meta", {})
        return f"""
        <div style="text-align: center; padding: 50px; color: #d4af37;">
            <h2>🌍 欢迎来到 {meta.get('name', '战锤40k宇宙')}</h2>
            <p style="color: #aaa; margin: 20px 0;">
                {meta.get('description', '在遥远的未来，人类帝国在银河中挣扎求存...')}
            </p>
            <p style="color: #888; font-size: 14px;">
                输入你的行动开始冒险吧！
            </p>
        </div>
        """
    
    html = '<div style="font-family: sans-serif; line-height: 1.6;">'
    
    for entry in chat_history:
        role = entry["role"]
        content = entry["content"]
        turn = entry["turn"]
        
        if role == "user":
            html += f"""
            <div style="margin: 15px 0; padding: 12px; background: rgba(50, 50, 50, 0.5); border-left: 3px solid #4a9eff; border-radius: 4px;">
                <div style="font-size: 12px; color: #888; margin-bottom: 5px;">回合 {turn} · 玩家</div>
                <div style="color: #fff;">{content}</div>
            </div>
            """
        else:
            # 处理AI回复中的骰子结果
            content_html = content.replace('\n', '<br>')
            html += f"""
            <div style="margin: 15px 0; padding: 12px; background: rgba(40, 40, 40, 0.5); border-left: 3px solid #d4af37; border-radius: 4px;">
                <div style="font-size: 12px; color: #888; margin-bottom: 5px;">回合 {turn} · 游戏主持人</div>
                <div style="color: #ddd;">{content_html}</div>
            </div>
            """
    
    html += '</div>'
    return html

def clear_history():
    """清空对话历史"""
    global chat_history
    chat_history = []
    return format_chat_history()

# 创建Gradio界面
with gr.Blocks(
    title="Faramita Worlds - 战锤40k DEMO",
    theme=gr.themes.Default(
        primary_hue="amber",
        secondary_hue="slate"
    )
) as demo:
    gr.Markdown("""
    # 🌍 Faramita Worlds - 战锤40k 宇宙 DEMO
    
    在这个黑暗的未来宇宙中，你将扮演一名帝国战士，在卡利西斯星区展开冒险。
    与AI游戏主持人互动，探索世界，进行战斗，书写你的传奇！
    """)
    
    with gr.Row():
        with gr.Column(scale=3):
            # 聊天显示区域
            chat_display = gr.HTML(
                value=format_chat_history(),
                elem_id="chat-display"
            )
            
            # 输入区域
            with gr.Row():
                user_input = gr.Textbox(
                    label="你的行动",
                    placeholder="输入你的指令，例如：探索周围的环境",
                    lines=2,
                    max_lines=4
                )
                send_btn = gr.Button("发送", variant="primary")
            
            # 按钮区域
            with gr.Row():
                clear_btn = gr.Button("清空对话")
                continue_btn = gr.Button("继续剧情")
        
        with gr.Column(scale=1):
            # 世界信息面板
            gr.Markdown("### 📖 世界信息")
            world_info = gr.JSON(
                value=lambda: load_world_book()["world_meta"],
                label="世界元信息"
            )
            
            gr.Markdown("### 🎲 快捷骰子")
            with gr.Row():
                d20_btn = gr.Button("1d20")
                d100_btn = gr.Button("1d100")
            
            # 骰子结果显示
            dice_result = gr.Textbox(label="骰子结果", interactive=False)
    
    # 事件绑定
    send_btn.click(
        fn=process_message,
        inputs=[user_input],
        outputs=[user_input, chat_display]
    )
    
    user_input.submit(
        fn=process_message,
        inputs=[user_input],
        outputs=[user_input, chat_display]
    )
    
    clear_btn.click(
        fn=clear_history,
        outputs=[chat_display]
    )
    
    continue_btn.click(
        fn=lambda: process_message("继续"),
        inputs=[],
        outputs=[user_input, chat_display]
    )
    
    # 骰子快捷按钮
    d20_btn.click(
        fn=lambda: json.dumps(DiceLogic.parse_and_roll("1d20"), indent=2, ensure_ascii=False),
        outputs=[dice_result]
    )
    
    d100_btn.click(
        fn=lambda: json.dumps(DiceLogic.parse_and_roll("1d100"), indent=2, ensure_ascii=False),
        outputs=[dice_result]
    )

if __name__ == "__main__":
    # 从环境变量获取端口，默认7860
    port = int(os.getenv("PORT", 7860))
    demo.launch(
        server_name="0.0.0.0",
        server_port=port,
        share=False,
        show_api=False
    )