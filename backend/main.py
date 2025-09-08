from typing import Union
import os 
import shutil
from dmucs_test import seperate
from fastapi import FastAPI , File , UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse , HTMLResponse
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pathlib import Path

app = FastAPI()

app.mount("/static", StaticFiles(directory="../frontend"), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # or ["http://127.0.0.1:5506"] for more security
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/", response_class= HTMLResponse)
async def read_root():
    return FileResponse("../frontend/index.html")

# Add this route to serve JS files with correct MIME type
@app.get("/js/{filename}")
async def serve_js(filename: str):
    js_path = f"../frontend/js/{filename}"
    if os.path.exists(js_path):
        return FileResponse(js_path, media_type="application/javascript")
    raise HTTPException(status_code=404, detail="File not found")


@app.get("/items/{item_id}")
def read_item(item_id: int, q: Union[str, None] = None):
    return {"item_id": item_id, "q": q}

@app.post('/upload/')
def file_name(file:UploadFile = File(...)):
    return {"filename" : file.filename}



UPLOAD_DIR = "../uploads"
OUTPUT_DIR = "../output"
os.makedirs(UPLOAD_DIR, exist_ok=True)



@app.post('/seperate')
async def  song_seperator(file:UploadFile = File(...)):
    input_song_path= os.path.join(UPLOAD_DIR , file.filename)
    with open(input_song_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    try:    
        print("separating the intruments")
        seperate(input_song_path)
        # delete the file in upload folder 
        if os.path.exists(input_song_path):
            os.remove(input_song_path)

        return {
            "success":True,
            "status" : 'completed' ,
            "message" : "operation successful",
            "fileName" :  file.filename
        }
    except Exception as err:
        print('couldnt seperate' , err)
        # delete the file in upload folder 
        if os.path.exists(input_song_path):
            os.remove(input_song_path)
        return {
            "success":False,
            "status" : 'failed' ,
            "message" : "operation failed",
            "error" :  str(err)
        }

@app.get("/download/{song_name}/{stem_name}")
async def download_stem(song_name: str, stem_name: str):
    file_path = os.path.join(OUTPUT_DIR , song_name , stem_name)
      # convert to absolute path
    print("DEBUG: trying to serve", file_path)

    if not os.path.exists(file_path):
        print("debug : cant find the file" )
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        str(file_path),  # FileResponse prefers str paths
        media_type="audio/flac",
        filename=stem_name
    )

@app.get("/stems/{song_name}")
async def list_stems(song_name: str):
    folder_path = os.path.join('./output', song_name)
    if not os.path.exists(folder_path):
        return {"error": "Song not found"}
    stems = [f for f in os.listdir(folder_path) if f.endswith(".flac")]
    return {"stems": stems}


# API endpoint to serve individual stems
@app.get("/stems/{folder_name}/{filename}")
def get_stem_file(folder_name: str, filename: str):
    file_path = os.path.join(OUTPUT_DIR, folder_name, filename)
    print('got the audio')
    if not os.path.exists(file_path):
        print('coudnt get audio')
        raise HTTPException(status_code=404, detail="File not found xddd")
    
    return FileResponse(file_path ,
          headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "*",
            "Content-Type": "audio/flac",
            "Accept-Ranges": "bytes" 
        })

@app.get('/output-folder')
def list_outputs():
    print('fetching folders')
    output_dir = OUTPUT_DIR
    if not os.path.exists(output_dir):
        return {"folders": []}

    folders = [f for f in os.listdir(output_dir) if os.path.isdir(os.path.join(output_dir, f))]
    return {"folders": folders}