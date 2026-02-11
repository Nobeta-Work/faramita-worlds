import gradio as gr

def modelscope_quickstart(name):
    return "Welcome to modelscope, " + name + "!!"

demo = gr.Interface(fn=modelscope_quickstart, inputs="text", outputs="text")

demo.launch(server_name="0.0.0.0", server_port=7860)
