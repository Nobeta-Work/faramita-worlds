FROM modelscope-registry.cn-beijing.cr.aliyuncs.com/modelscope-repo/python:3.10

WORKDIR /home/user/app

# 复制项目文件
COPY ./ /home/user/app

# 安装依赖
RUN pip install -r requirements.txt

# 暴露端口
EXPOSE 7860

# 启动应用
ENTRYPOINT ["python", "-u", "app.py"]