from fastapi import FastAPI, Request, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import httpx
import base64
import google.generativeai as genai
import requests
from pydantic import BaseModel
from datetime import datetime

# Load environment variables
load_dotenv()

app = FastAPI()


origins = [
    "https://react-test-case-generator-app.vercel.app",
    "http://localhost:3000",  # optional, useful for local dev
]

# Enable CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # or ["*"] for public APIs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load API keys
GITHUB_TOKEN = os.getenv("GITHUB_ACCESS_TOKEN")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GITHUB_USERNAME = os.getenv("GITHUB_USERNAME")
REPO_OWNER = os.getenv("TARGET_REPO_OWNER")
REPO_NAME = os.getenv("TARGET_REPO_NAME")

class PRRequest(BaseModel):
    file_name: str
    code_content: str


# Configure Gemini client
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-2.5-flash-lite")

print("GITHUB_ACCESS_TOKEN loaded:", os.getenv("GITHUB_ACCESS_TOKEN"))

@app.get("/")
def read_root():
    return {"message": "Backend is running!"}


@app.get("/list-files")
async def list_repo_files(owner: str = Query(...), repo: str = Query(...)):
    url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/HEAD?recursive=1"
    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json"
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=headers)

    if response.status_code != 200:
        return {"error": "Failed to fetch files", "details": response.text}

    all_files = response.json().get("tree", [])
    code_extensions = (".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".go", ".rb", ".php", ".cs")
    code_files = [file["path"] for file in all_files if file["type"] == "blob" and file["path"].endswith(code_extensions)]

    return {"files": code_files}


@app.post("/generate-test-summaries")
async def generate_summaries(request: Request):
    data = await request.json()
    repo_url = data.get("repoUrl")
    selected_files = data.get("selectedFiles", [])

    if not repo_url or not selected_files:
        return {"summaries": []}

    try:
        # Extract GitHub owner and repo name
        parts = repo_url.strip("/").split("/")
        owner = parts[-2]
        repo = parts[-1]
        summaries = []

        async with httpx.AsyncClient() as client:
            for file_path in selected_files:
                file_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{file_path}"
                headers = {
                    "Authorization": f"Bearer {GITHUB_TOKEN}",
                    "Accept": "application/vnd.github.v3+json"
                }

                response = await client.get(file_url, headers=headers)

                if response.status_code == 200:
                    file_data = response.json()
                    content = base64.b64decode(file_data['content']).decode('utf-8')

                    prompt = (
                        f"You are a software test engineer. Analyze the following code and generate a brief summary "
                        f"describing what kind of test cases should be written for it. Be concise, specific, and helpful "
                        f"for a developer writing tests.\n\n"
                        f"File: {file_path}\n\n"
                        f"Code:\n{content}\n\n"
                        f"Summary:"
                    )

                    # Generate content using Gemini
                    gemini_response = model.generate_content(prompt)
                    summary = gemini_response.text.strip()

                else:
                    summary = f"Could not fetch `{file_path}`: {response.status_code}"

                summaries.append(f"**{file_path}**: {summary}")

        return {"summaries": summaries}

    except Exception as e:
        return {"summaries": [f"Error: {str(e)}"]}


@app.post("/generate-test-code")
async def generate_test_code(request: Request):
    data = await request.json()
    repo_url = data.get("repoUrl")
    file_path = data.get("filePath")
    summary = data.get("summary", "")

    if not repo_url or not file_path:
        return {"error": "Missing required fields"}

    try:
        # Extract GitHub owner and repo
        parts = repo_url.strip("/").split("/")
        owner = parts[-2]
        repo = parts[-1]

        file_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{file_path}"
        headers = {
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "Accept": "application/vnd.github.v3+json"
        }

        async with httpx.AsyncClient() as client:
            response = await client.get(file_url, headers=headers)

        if response.status_code != 200:
            return {"error": f"Could not fetch `{file_path}`: {response.status_code}"}

        file_data = response.json()
        content = base64.b64decode(file_data['content']).decode('utf-8')

        prompt = (
            f"You are a professional software test engineer.\n"
            f"Write comprehensive unit tests for the following code using the best practices and relevant testing frameworks.\n"
            f"Include edge cases and follow the standard naming conventions.\n\n"
            f"File: {file_path}\n"
        )
        if summary:
            prompt += f"Summary of what to test: {summary}\n\n"
        prompt += f"Code:\n{content}\n\n"
        prompt += f"Test Code:"

        gemini_response = model.generate_content(prompt)
        test_code = gemini_response.text.strip()

        return {"testCode": test_code}

    except Exception as e:
        return {"error": str(e)}

@app.post("/create-pr/")
def create_pull_request(req: PRRequest):
    headers = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json"
    }

    # Step 1: Get the default branch (usually main)
    repo_url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}"
    repo_resp = requests.get(repo_url, headers=headers)
    if repo_resp.status_code != 200:
        raise HTTPException(status_code=repo_resp.status_code, detail="Failed to get repository info")
    default_branch = repo_resp.json().get("default_branch", "main")

    # Step 2: Get latest commit SHA from default branch
    ref_url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/git/ref/heads/{default_branch}"
    ref_resp = requests.get(ref_url, headers=headers)
    if ref_resp.status_code != 200:
        raise HTTPException(status_code=ref_resp.status_code, detail="Failed to get reference to default branch")
    commit_sha = ref_resp.json()["object"]["sha"]

    # Step 3: Create a new branch
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    new_branch_name = f"add-testcases-{timestamp}"
    ref_data = {
        "ref": f"refs/heads/{new_branch_name}",
        "sha": commit_sha
    }
    ref_create = requests.post(f"{repo_url}/git/refs", headers=headers, json=ref_data)
    if ref_create.status_code not in [200, 201]:
        raise HTTPException(status_code=ref_create.status_code, detail="Failed to create new branch")

    # Step 4: Create a new file in the new branch
    file_path = f"generated_tests/{req.file_name}_test.js"
    file_url = f"{repo_url}/contents/{file_path}"
    commit_message = f"Add test cases for {req.file_name}"
    encoded_content = base64.b64encode(req.code_content.encode("utf-8")).decode("utf-8")

    file_data = {
        "message": commit_message,
        "content": encoded_content,
        "branch": new_branch_name
    }

    file_create = requests.put(file_url, headers=headers, json=file_data)
    if file_create.status_code not in [200, 201]:
        raise HTTPException(status_code=file_create.status_code, detail="Failed to create file in new branch")

    # Step 5: Create the Pull Request
    pr_data = {
        "title": f"[Auto] Add test cases for {req.file_name}",
        "head": new_branch_name,
        "base": default_branch,
        "body": "This PR was automatically created by the Test Case Generator App."
    }
    pr_resp = requests.post(f"{repo_url}/pulls", headers=headers, json=pr_data)
    if pr_resp.status_code not in [200, 201]:
        raise HTTPException(status_code=pr_resp.status_code, detail="Failed to create pull request")

    return {
        "message": "Pull request created successfully",
        "pr_url": pr_resp.json()["html_url"]
    }