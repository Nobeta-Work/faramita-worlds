FROM modelscope-registry.cn-beijing.cr.aliyuncs.com/modelscope-repo/python:3.10

WORKDIR /home/user/app

COPY ./ /home/user/app

# Force upgrade/reinstall of gradio to the latest version and install openai
RUN python -m pip uninstall -y gradio && \
    python -m pip install --no-cache-dir --upgrade gradio openai requests

ENTRYPOINT ["python", "-u", "app.py"]
