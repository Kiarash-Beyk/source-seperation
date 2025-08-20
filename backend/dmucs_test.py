import torch
from demucs.pretrained import get_model
from demucs.apply import apply_model
import torchaudio
import soundfile as sf
import os


 # song_name
# song="reza-sobhani.mp3"
# song_name=os.path.splitext(song)[0]


def space_remover(song_name):
    name_without_space = ''
    for i in song_name:
        if i == ' ':
            i = "_"
        name_without_space += i
    return name_without_space  



def seperate(input_path : str):

    # song names
    song_name = space_remover(os.path.basename(input_path))
    song_name_without_extension = space_remover(song_name.replace(".mp3" , "" )) 

    #set path and dir 
    try:
        os.makedirs('./model_cache', exist_ok=True)
        os.makedirs(f"../output/{song_name_without_extension}", exist_ok=True)
        output_dir = f"../output/{song_name_without_extension}"
    except Exception as err:
        print(f'couldnt create the dir  {err}' )    

    os.environ['TORCH_HOME'] = './model_cache'

    # Load model
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = get_model(name="htdemucs").to(device)
    print(device)

    # Load audio
    try:
        waveform, sr = torchaudio.load(input_path)
    except Exception as e:
        print(f"Error loading audio: {e}")
        return
    waveform = waveform.to(device)
    # Ensure stereo
    if waveform.shape[0] == 1:
        waveform = waveform.repeat(2, 1)

    # Add batch dimension: shape becomes [1, 2, samples]
    waveform = waveform.unsqueeze(0)

    # Apply model
    with torch.no_grad():
        sources = apply_model(model, waveform, device=device)  # Tensor [1, 4, 2, samples]

    # Remove batch dim
    sources = sources[0]  # Shape: [4, 2, samples]

    # Save each stem
    stem_names = ['drums', 'bass', 'other', 'vocals']
    for i, stem in enumerate(stem_names):
        audio = sources[i].cpu().numpy().T  # [samples, channels]
        output_path = os.path.join(output_dir, f"{stem}.flac")
        sf.write(output_path, audio, sr, format='FLAC')
        print(f"Saved {stem} to {output_path}")
    return output_path

