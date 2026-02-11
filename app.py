import gradio as gr
import os

def modelscope_quickstart(name):
    return "Welcome to modelscope, " + name + "!!"

demo = gr.Interface(fn=modelscope_quickstart, inputs="text", outputs="text")

demo.launch(server_name="0.0.0.0", server_port=7860)
    
# 1. 项目说明
project_intro = """
# Faramita Worlds

Faramita Worlds 是一个基于AI驱动的多世界TRPG沙盒系统，支持多种世界模板与角色设定，提供丰富的叙事与互动体验。项目原生为 Electron+Vite+Vue+TypeScript+Pinia+Dexie+Gradio 开发，支持本地桌面端完整功能。
"""

# 2. 为什么只部署功能demo
why_demo = """
## 为什么创空间只展示功能Demo？
- 本项目完整形态为 Electron 桌面端，无法直接部署到创空间。
- 创空间环境仅支持 Web 端 Gradio 演示，无法运行 Electron 渲染进程。
- 因此本页面仅为功能演示，完整体验请本地运行 Electron。
"""

# 3. 功能demo说明
feature_demo = """
## 功能Demo说明
- 支持世界模板选择，AI根据设定进行叙事。
- 支持聊天、掷骰、角色互动等TRPG核心功能。
- API KEY通过环境变量MS_KEY加载，安全性提升。
- 服务监听0.0.0.0:7860，允许外部访问。
"""

# 4. 资源演示
DEMO_VIDEO = os.path.join(os.path.dirname(__file__), "resources/演示demo.mp4")
DEMO_IMAGE = os.path.join(os.path.dirname(__file__), "resources/演示图片1.png")

with gr.Blocks(title="Faramita Worlds - 创空间功能Demo") as demo:
    gr.Markdown(project_intro)
    gr.Markdown(why_demo)
    gr.Markdown(feature_demo)
    gr.Markdown("## 演示资源")
    gr.Video(DEMO_VIDEO, label="功能演示视频")
    gr.Image(DEMO_IMAGE, label="功能演示截图")
    gr.Markdown("---\n如需完整体验，请克隆项目并在本地运行 Electron 桌面端。\n\n[详细说明见 faramita-explore-worlds/DEPLOYMENT_DEMO.md]")

demo.launch(server_name="0.0.0.0", server_port=7860)
