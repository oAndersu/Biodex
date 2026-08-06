document.addEventListener('DOMContentLoaded', () => {
    const openCameraBtn = document.getElementById('openCameraBtn');
    const captureBtn = document.getElementById('captureBtn');
    const cameraVideo = document.getElementById('cameraVideo');
    const cameraSnapshot = document.getElementById('cameraSnapshot');
    const cameraPreview = document.getElementById('cameraPreview');
    const cameraStatus = document.getElementById('cameraStatus');
    const speciesResult = document.getElementById('speciesResult');
    let stream = null;

    function resetPreview() {
        if (cameraSnapshot) {
            cameraSnapshot.src = '';
            cameraSnapshot.classList.remove('visible');
        }
        if (cameraPreview) {
            cameraPreview.classList.remove('visible');
        }
        if (speciesResult) {
            speciesResult.innerHTML = '';
        }
    }

    async function startCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            cameraStatus.textContent = 'Seu navegador não suporta acesso à câmera.';
            return;
        }

        try {
            resetPreview();
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false,
            });

            cameraVideo.srcObject = stream;
            await cameraVideo.play();
            cameraVideo.classList.add('active');
            captureBtn.classList.add('visible');
            cameraStatus.textContent = 'Câmera ativada. Posicione o dispositivo e tire a foto.';
        } catch (error) {
            cameraStatus.textContent = 'Permissão negada ou erro ao abrir a câmera.';
            console.error('Erro ao iniciar a câmera:', error);
        }
    }

    async function identifyPlant(imageDataUrl) {
        if (!speciesResult) return;

        speciesResult.innerHTML = '<p>Enviando imagem para análise...</p>';
        cameraStatus.textContent = 'Analisando a imagem com a PlantaNet...';

        try {
            const response = await fetch('/api/identify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageDataUrl })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Falha na análise da imagem.');
            }

            const bestMatch = data.results?.[0];
            const scientificName = bestMatch?.species?.scientificName || 'Espécie não identificada';
            const commonName = bestMatch?.species?.commonNames?.[0] || 'Nome comum indisponível';
            const score = bestMatch?.score ? `${Math.round(bestMatch.score)}%` : 'n/d';

            speciesResult.innerHTML = `
                <strong>Possível identificação:</strong><br>
                <span>${commonName}</span><br>
                <small>${scientificName}</small><br>
                <small>Confiança: ${score}</small>
            `;

            cameraStatus.textContent = 'Identificação concluída.';
        } catch (error) {
            speciesResult.innerHTML = `<p>Não foi possível identificar a espécie. ${error.message}</p>`;
            cameraStatus.textContent = 'Erro ao analisar a imagem.';
            console.error('Erro ao identificar planta:', error);
        }
    }

    function capturePhoto() {
        if (!cameraVideo || cameraVideo.readyState < 2) {
            cameraStatus.textContent = 'A câmera ainda não está pronta. Tente novamente.';
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = cameraVideo.videoWidth;
        canvas.height = cameraVideo.videoHeight;
        const context = canvas.getContext('2d');
        context.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);

        const imageDataUrl = canvas.toDataURL('image/png');
        cameraSnapshot.src = imageDataUrl;
        cameraSnapshot.classList.add('visible');
        if (cameraPreview) {
            cameraPreview.classList.add('visible');
        }
        cameraStatus.textContent = 'Foto capturada! Enviando para análise...';
        identifyPlant(imageDataUrl);
    }

    if (openCameraBtn) {
        openCameraBtn.addEventListener('click', startCamera);
    }

    if (captureBtn) {
        captureBtn.addEventListener('click', capturePhoto);
    }
});
