FROM modelscope-registry.cn-beijing.cr.aliyuncs.com/modelscope-repo/python:3.10

WORKDIR /home/user/app

COPY ./ /home/user/app

RUN pip install -r requirements.txt

ENTRYPOINT ["python", "-u", "app.py"]
