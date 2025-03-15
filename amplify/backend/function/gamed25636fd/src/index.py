import awsgi
from app import app  # Import your Flask app from app.py

def handler(event, context):
    return awsgi.response(app, event, context)
