import { stars } from './stars.js';
const asterisms = window.asterisms.flatMap(c => c.lines);


const starMap = new Map();
for (const star of stars) {
    starMap.set(star.hip, star);
}

const gradient1 = ['#CECECC', '#FDE2D0', '#FAB4A3'];
const gradient2 = ['#016FDB', '#F4E9ED', '#ADB8DF'];
const gradient3 = ['#294472', '#7579A7', '#C4B8C8'];
const gradient4 = ['#000000', '#4D5FB8', '#D0D3DE'];

const gradientMap = [
    { from: 0, to: 12, gradients: [gradient1, gradient2] },
    { from: 12, to: 15, gradients: [gradient2, gradient3] },
    { from: 15, to: 18, gradients: [gradient3, gradient4] },
    { from: 18, to: 24, gradients: [gradient4, gradient1] }
];

const noneGradient = ['#000000'];
gradientMap.push({ from: 0, to: 24, gradients: [noneGradient] });


let currentGradient = null;

window.addEventListener("DOMContentLoaded", () => {

    const magnitudeSlider = document.getElementById("magLimit");
    const magValueEl = document.getElementById("magValue");
    const latSlider = document.getElementById("latitude");
    latSlider.min = -89;
    latSlider.max = 89;
    const latValueEl = document.getElementById("latValue");
    const toggleConstellationsOnly = document.getElementById("toggleConstellationsOnly");
    const autoLatBtn = document.getElementById("getLocation");

    const constellationBuffers = [];




    magnitudeSlider.addEventListener("input", () => {
        maxMagnitude = parseFloat(magnitudeSlider.value);
        updateSlider(magnitudeSlider, magValueEl, null, false);
        updateStarBuffer();
    });




    let observerLat = 56.2965;
    latSlider.value = observerLat;
    updateSlider(latSlider, latValueEl, null, true);


    let maxMagnitude = 4.5;
    let avgSize = 16;
    let showOnlyConstellations = true;
    let pointCount = 0;
    let time = Date.now();
    let timeSpeed = 60 * 60 * 1000;
    let isPaused = false;
    let lastFrameTime = performance.now();
    let useRealTime = true;
    let manualResize = false;



    const constellationDotBuffers = [];
    let constellationDotCount = 0;
    let positions = [];




    const canvas = document.getElementById("glcanvas");
    const gl = canvas.getContext("webgl2", { alpha: true })
        || canvas.getContext("webgl", { alpha: true })
        || canvas.getContext("experimental-webgl", { alpha: true });
    if (!gl) {
        alert("Ваш браузер не поддерживает WebGL");
        throw new Error("WebGL not supported");
    }
    gl.clearColor(0, 0, 0, 0);

    gl.clearColor(0, 0, 0, 0);

    const sizeBuffer = gl.createBuffer();


    function resizeCanvas() {
        if (manualResize) return;

        const dpr = window.devicePixelRatio || 1;
        const width = window.innerWidth * dpr;
        const height = window.innerHeight * dpr;

        canvas.width = width;
        canvas.height = height;
        canvas.style.width = window.innerWidth + "px";
        canvas.style.height = window.innerHeight + "px";

        gl.viewport(0, 0, width, height);

        draw();
    }



    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);


    if (!gl) {
        alert("WebGL не поддерживается");
    }

    let zoom = 1;
    let offsetX = 0;
    let offsetY = 0;
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;


    function getLST() {
        const JD = time / 86400000 + 2440587.5;
        const GMST = 280.4606 + 360.985647 * (JD - 2451545);
        return (GMST % 360 + 360) % 360;
    }


    function project(ra, dec) {
        const lst = getLST();
        const raDeg = ra * 15;
        const ha = ((lst - raDeg + 360) % 360) * Math.PI / 180;

        const decRad = dec * Math.PI / 180;
        const latRad = observerLat * Math.PI / 180;

        const sinAlt = Math.sin(decRad) * Math.sin(latRad) +
            Math.cos(decRad) * Math.cos(latRad) * Math.cos(ha);
        const alt = Math.asin(sinAlt);

        const cosAz = (Math.sin(decRad) - Math.sin(alt) * Math.sin(latRad)) /
            (Math.cos(alt) * Math.cos(latRad));

        let az;
        if (cosAz <= -1) az = Math.PI;
        else if (cosAz >= 1) az = 0;
        else az = Math.acos(cosAz);

        if (Math.sin(ha) > 0) az = 2 * Math.PI - az;

        const x = az / (2 * Math.PI);
        const y = (alt + Math.PI / 2) / Math.PI;
        return [x, y];
    }

    function isLineShort3D(star1, star2, maxAngleDeg = 15) {
        const ra1 = star1.ra * 15 * Math.PI / 180;
        const dec1 = star1.dec * Math.PI / 180;
        const ra2 = star2.ra * 15 * Math.PI / 180;
        const dec2 = star2.dec * Math.PI / 180;

        const cosD = Math.sin(dec1) * Math.sin(dec2) +
            Math.cos(dec1) * Math.cos(dec2) * Math.cos(ra1 - ra2);
        const angleRad = Math.acos(Math.min(Math.max(cosD, -1), 1));
        const angleDeg = angleRad * 180 / Math.PI;

        return angleDeg < maxAngleDeg;
    }





    canvas.addEventListener("wheel", (event) => {
        event.preventDefault();
        const zoomDelta = -event.deltaY * 0.001;
        const prevZoom = zoom;
        zoom = Math.max(0.1, Math.min(5, zoom * (1 + zoomDelta)));

        const rect = canvas.getBoundingClientRect();
        const mx = (event.clientX - rect.left) / rect.width;
        const my = (event.clientY - rect.top) / rect.height;

        const worldX = (mx - 0.5 - offsetX) / prevZoom;
        const worldY = (my - 0.5 - offsetY) / prevZoom;

        offsetX = mx - 0.5 - worldX * zoom;
        offsetY = my - 0.5 - worldY * zoom;



        draw();
    }, { passive: false });

    canvas.addEventListener("mousedown", (e) => {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    canvas.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;

        const scale = canvas.getBoundingClientRect();
        offsetX += (dx / scale.width) / zoom;
        offsetY += (dy / scale.height) / zoom;



        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        draw();
    });


    canvas.addEventListener("mouseup", () => { isDragging = false; });
    canvas.addEventListener("mouseleave", () => { isDragging = false; });

    const vertexShaderSource = `
precision mediump float;
attribute float a_size;
attribute vec2 a_position;
uniform vec2 u_resolution;
uniform float u_zoom;
uniform vec2 u_offset;
uniform float u_pointMode;
uniform float u_pointSize;

void main() {
    vec2 centered = (a_position - 0.5) * 2.0;
    vec2 scaled = centered * u_zoom + u_offset;

    float aspect = u_resolution.x / u_resolution.y;
    vec2 adj = vec2(1.5, aspect);
    gl_Position = vec4(scaled * adj * vec2(1.0, -1.0), 0.0, 1.0);

    if (u_pointMode == 0.0) {
    // звезды — индивидуальный размер
    gl_PointSize = a_size * u_zoom;
} else if (u_pointMode == 2.0) {
    // точки на линиях — общий размер
    gl_PointSize = u_pointSize * u_zoom;
} else {
    // fallback
    gl_PointSize = 2.0;
}
}
`;



    const fragmentShaderSource = `
precision mediump float;

uniform sampler2D u_sprite;
uniform vec4 u_color;
uniform float u_pointMode;

void main() {
    if (u_pointMode == 1.0) {
        // линии
        gl_FragColor = vec4(1.0, 1.0, 1.0, 0.7);
    } else if (u_pointMode == 2.0) {
    gl_FragColor = u_color;
}
 else {
        // звезды со спрайтом
        vec4 tex = texture2D(u_sprite, gl_PointCoord);
        if (tex.a < 0.1) discard;
        gl_FragColor = tex * u_color;
    }
}
`;




    function createShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error("Shader compile error:", gl.getShaderInfoLog(shader));
            console.error("Source:\n", source);
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }


    function createProgram(gl, vShader, fShader) {
        const program = gl.createProgram();
        gl.attachShader(program, vShader);
        gl.attachShader(program, fShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error("Program link error:", gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
            return null;
        }

        return program;
    }


    function updateTimeDisplay() {
        const timeBox = document.getElementById("time");
        const coordsBox = document.getElementById("coords");

        if (timeBox) {
            const date = new Date(time);
            const h = date.getUTCHours().toString().padStart(2, "0");
            const m = date.getUTCMinutes().toString().padStart(2, "0");
            const s = date.getUTCSeconds().toString().padStart(2, "0");
            const day = date.getUTCDate().toString().padStart(2, "0");
            const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
            const year = date.getUTCFullYear();
            timeBox.textContent = `${h}:${m}:${s}  ·  ${day}.${month}.${year}`;
        }

        if (coordsBox) {
            const lst = getLST().toFixed(1);
            coordsBox.textContent = `Широта: ${observerLat.toFixed(1)}°, LST: ${lst}°`;
        }
    }




    function updateLatDisplay(value) {
        const latValue = document.getElementById("latValue");
        if (latValue) latValue.textContent = `${value.toFixed(1)}°`;
    }


    function updateStarBuffer() {
        const constellationStarHips = new Set();
        const seenPositions = new Set();
        for (const { lines } of window.asterisms) {
            for (const [hip1, hip2] of lines) {
                constellationStarHips.add(hip1);
                constellationStarHips.add(hip2);
            }
        }



        positions = [];
        const sizes = [];

        const MIN_STAR_SIZE = 16;
        const MAX_STAR_SIZE = 32;
        const t = (maxMagnitude - 1) / (7 - 1);
        const clampedT = Math.min(Math.max(t, 0), 1);
        const uniformSize = MAX_STAR_SIZE - clampedT * (MAX_STAR_SIZE - MIN_STAR_SIZE);

        const seen = [];
        const minDist = 0.02;

        stars.filter(s => constellationStarHips.has(s.hip) && s.mag <= maxMagnitude)
            .forEach(s => {
                const pos = project(s.ra, s.dec);
                if (!pos) return;

                const [x, y] = pos;
                const tooClose = seen.some(([sx, sy]) => {
                    const dx = x - sx;
                    const dy = y - sy;
                    return dx * dx + dy * dy < minDist * minDist;
                });

                if (tooClose) return;

                seen.push([x, y]);
                positions.push(x, y);
                sizes.push(uniformSize);
            });

        pointCount = positions.length / 2;

        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sizes), gl.STATIC_DRAW);

        avgSize = uniformSize;

        updateConstellationBuffer();
        draw();

        const visibleCountBox = document.getElementById("visible-stars");
        if (visibleCountBox) {
            visibleCountBox.textContent = pointCount.toString();
        }
    }



    const constellationBuffer = gl.createBuffer();
    let constellationLineCount = 0;

    function updateConstellationBuffer() {

        const dpr = window.devicePixelRatio || 1;
        const heightPixels = canvas.height / dpr;
        const dotSpacingPx = 20;
        const DOT_SPACING = dotSpacingPx / heightPixels;

        const seenDots = [];
        constellationDotBuffers.length = 0;


        for (const { lines } of window.asterisms) {
            const dotPositions = [];

            for (const [hip1, hip2] of lines) {
                const star1 = starMap.get(hip1);
                const star2 = starMap.get(hip2);
                if (!star1 || !star2) continue;

                if (!isLineShort3D(star1, star2)) continue;

                const p1 = project(star1.ra, star1.dec);
                const p2 = project(star2.ra, star2.dec);
                if (!p1 || !p2) continue;
                if (!Number.isFinite(p1[0]) || !Number.isFinite(p1[1]) || !Number.isFinite(p2[0]) || !Number.isFinite(p2[1])) continue;

                const screenDist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
                if (screenDist > 0.5) continue;



                const dx = p2[0] - p1[0];
                const dy = p2[1] - p1[1];
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 0.02) continue;

                const steps = Math.max(2, Math.floor(dist / DOT_SPACING));


                for (let i = 0; i <= steps; i++) {
                    const t = i / steps;
                    if (t < 0.1 || t > 0.9) continue;

                    const x = p1[0] * (1 - t) + p2[0] * t;
                    const y = p1[1] * (1 - t) + p2[1] * t;

                    const tooClose = seenDots.some(([sx, sy]) => {
                        const dx = x - sx;
                        const dy = y - sy;
                        return dx * dx + dy * dy < 0.00001;
                    });
                    if (tooClose) continue;

                    seenDots.push([x, y]);
                    dotPositions.push(x, y);

                }



            }

            if (dotPositions.length > 0) {
                const buf = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, buf);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dotPositions), gl.STATIC_DRAW);
                constellationDotBuffers.push({ buffer: buf, count: dotPositions.length / 2 });
            }
        }
    }

    function fitStarsToView() {
        zoom = 1;
        offsetX = 0;
        offsetY = 0;
        draw();
    }




    latSlider.addEventListener("input", () => {
        observerLat = parseFloat(latSlider.value);
        updateSlider(latSlider, latValueEl, null, true);
        updateStarBuffer();
    });

    updateSlider(magnitudeSlider, magValueEl, null, false);
    updateSlider(latSlider, latValueEl, null, true);


    autoLatBtn.addEventListener("click", () => {
        navigator.geolocation.getCurrentPosition((pos) => {
            observerLat = pos.coords.latitude;
            latSlider.value = observerLat;
            updateSlider(latSlider, document.getElementById("latValue"), null, true);

            updateLatDisplay(observerLat);
            updateStarBuffer();
        });


    });




    const vShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    const program = createProgram(gl, vShader, fShader);

    gl.useProgram(program);

    const starImage = new Image();
    starImage.src = 'star 2.svg';
    let starTexture;
    starImage.onload = () => {
        starTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, starTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, starImage);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        //observerLat = parseFloat(document.getElementById("latitude").value);
        updateLatDisplay(observerLat);

        updateStarBuffer();
        updateConstellationBuffer();
        fitStarsToView();
    };




    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    const positionLocation = gl.getAttribLocation(program, "a_position");
    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    const zoomLocation = gl.getUniformLocation(program, "u_zoom");
    const offsetLocation = gl.getUniformLocation(program, "u_offset");
    const pointModeLocation = gl.getUniformLocation(program, "u_pointMode");






    function draw() {
        if (!starTexture) return;

        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(resolutionLocation, canvas.width, canvas.height);


        const sizeLocation = gl.getAttribLocation(program, "a_size");
        gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuffer);
        gl.enableVertexAttribArray(sizeLocation);
        gl.vertexAttribPointer(sizeLocation, 1, gl.FLOAT, false, 0, 0);


        gl.uniform1f(zoomLocation, zoom);
        gl.uniform2f(offsetLocation, offsetX, offsetY);

        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, starTexture);
        gl.uniform1i(gl.getUniformLocation(program, 'u_sprite'), 0);

        gl.uniform4fv(gl.getUniformLocation(program, 'u_color'), [1, 1, 1, 1]);

        gl.uniform1f(pointModeLocation, 0.0);

        gl.drawArrays(gl.POINTS, 0, pointCount);


        for (const { buffer, count } of constellationDotBuffers) {
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.enableVertexAttribArray(positionLocation);
            gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

            gl.uniform1f(pointModeLocation, 2.0);
            gl.uniform4fv(gl.getUniformLocation(program, 'u_color'), [1, 1, 1, 1]);

            const squareSize = avgSize / 3;
            gl.uniform1f(gl.getUniformLocation(program, 'u_pointSize'), squareSize);

            gl.drawArrays(gl.POINTS, 0, count);
        }

        updateBackground();
    }


    document.getElementById('savePngBtn')?.addEventListener('click', () => {
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;

        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = width;
        exportCanvas.height = height;

        const ctx = exportCanvas.getContext("2d");
        ctx.drawImage(canvas, 0, 0, width, height);

        exportCanvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "sky_export.png";
            a.click();
            URL.revokeObjectURL(url);
        }, "image/png");
    });


    function exportToSVG() {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const dpr = window.devicePixelRatio || 1;

        const width = canvas.width / dpr;
        const height = canvas.height / dpr;

        svg.setAttribute('width', width);
        svg.setAttribute('height', height);
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

        const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bgRect.setAttribute('width', '100%');
        bgRect.setAttribute('height', '100%');

        if (currentGradient === "none") {
            bgRect.setAttribute('fill', '#2A2A2A');
        } else if (!currentGradient) {
            const hour = new Date(time).getUTCHours();
            const entry = gradientMap.find(e => hour >= e.from && hour < e.to) || gradientMap[0];
            const gradientId = 'gradient_' + Date.now();

            const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
            const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
            grad.setAttribute('id', gradientId);
            grad.setAttribute('x1', '0%');
            grad.setAttribute('y1', '0%');
            grad.setAttribute('x2', '0%');
            grad.setAttribute('y2', '100%');

            entry.gradients[0].forEach((color, i) => {
                const stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
                stop.setAttribute('offset', `${i * 100 / (entry.gradients[0].length - 1)}%`);
                stop.setAttribute('stop-color', color);
                grad.appendChild(stop);
            });

            defs.appendChild(grad);
            svg.appendChild(defs);
            bgRect.setAttribute('fill', `url(#${gradientId})`);
        } else {
            const gradientId = 'gradient_' + Date.now();
            const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
            const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
            grad.setAttribute('id', gradientId);
            grad.setAttribute('x1', '0%');
            grad.setAttribute('y1', '0%');
            grad.setAttribute('x2', '0%');
            grad.setAttribute('y2', '100%');

            currentGradient.forEach((color, i) => {
                const stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
                stop.setAttribute('offset', `${i * 100 / (currentGradient.length - 1)}%`);
                stop.setAttribute('stop-color', color);
                grad.appendChild(stop);
            });

            defs.appendChild(grad);
            svg.appendChild(defs);
            bgRect.setAttribute('fill', `url(#${gradientId})`);
        }

        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        defs.innerHTML = `
            <clipPath id="clip0_5591_5344">
                <rect width="64" height="64" fill="white"/>
            </clipPath>
        `;

        const symbol = document.createElementNS("http://www.w3.org/2000/svg", "symbol");
        symbol.setAttribute("id", "star-symbol");
        symbol.setAttribute("viewBox", "0 0 64 64");
        symbol.innerHTML = `
            <g clip-path="url(#clip0_5591_5344)">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M64.0019 1.84961V62.1513H0.128906V1.84961L64.0019 1.84961ZM26.35 34.8089L14.7728 49.9923L21.0872 55.1047L32.3639 39.9196L43.789 55.1047L49.9532 49.9923L38.5264 34.6588L56.2678 28.6447L54.0121 21.1283L36.2725 26.8398V9.4008H28.6038V27.1404L10.2633 21.1283L7.85731 28.6447L26.35 34.8089Z" fill="white"/>
            </g>
        `;

        defs.appendChild(symbol);
        svg.appendChild(defs);
        svg.appendChild(bgRect);

        updateStarBuffer();
        updateConstellationBuffer();

        const starSize = avgSize / dpr;
        for (let i = 0; i < pointCount; i++) {
            const nx = (positions[i * 2] - 0.5) * zoom + 0.5 + offsetX;
            const ny = (positions[i * 2 + 1] - 0.5) * zoom + 0.5 + offsetY;
            if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;
            const x = nx * width;
            const y = ny * height;

            const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
            use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#star-symbol");
            use.setAttribute("x", x - starSize / 2);
            use.setAttribute("y", y - starSize / 2);
            use.setAttribute("width", starSize);
            use.setAttribute("height", starSize);
            svg.appendChild(use);
        }

        const squareSize = (avgSize / 3) / dpr;
        const gap = squareSize * 3;

        for (const { lines } of window.asterisms) {
            for (const [hip1, hip2] of lines) {
                const star1 = starMap.get(hip1);
                const star2 = starMap.get(hip2);
                if (!star1 || !star2) continue;

                if (!isLineShort3D(star1, star2)) continue;

                let p1 = project(star1.ra, star1.dec);
                let p2 = project(star2.ra, star2.dec);
                if (!p1 || !p2) continue;
                if (!Number.isFinite(p1[0]) || !Number.isFinite(p1[1]) || !Number.isFinite(p2[0]) || !Number.isFinite(p2[1])) continue;

                const screenDist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
                if (screenDist > 0.5) continue;

                p1 = [
                    (p1[0] - 0.5) * zoom + 0.5 + offsetX,
                    (p1[1] - 0.5) * zoom + 0.5 + offsetY
                ];
                p2 = [
                    (p2[0] - 0.5) * zoom + 0.5 + offsetX,
                    (p2[1] - 0.5) * zoom + 0.5 + offsetY
                ];

                const x1 = p1[0] * width;
                const y1 = p1[1] * height;
                const x2 = p2[0] * width;
                const y2 = p2[1] * height;

                const dx = x2 - x1;
                const dy = y2 - y1;
                const length = Math.sqrt(dx * dx + dy * dy);
                const steps = length / (squareSize + gap);

                for (let i = 0; i <= steps; i++) {
                    const t = i / steps;
                    if (t < 0.1 || t > 0.9) continue;

                    const x = x1 + dx * t;
                    const y = y1 + dy * t;

                    if (x < 0 || x > width || y < 0 || y > height) continue;


                    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    rect.setAttribute('x', x - squareSize / 2);
                    rect.setAttribute('y', y - squareSize / 2);
                    rect.setAttribute('width', squareSize);
                    rect.setAttribute('height', squareSize);
                    rect.setAttribute('fill', 'white');
                    svg.appendChild(rect);
                }
            }
        }

        const serializer = new XMLSerializer();
        let svgStr = serializer.serializeToString(svg);
        svgStr = '<?xml version="1.0" standalone="no"?>\n' + svgStr;

        const blob = new Blob([svgStr], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "sky_export.svg";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    document.getElementById('saveSvgBtn')?.addEventListener('click', exportToSVG);

    document.getElementById('resetViewBtn')?.addEventListener('click', () => {
        fitStarsToView();
    });


    const resButtons = document.querySelectorAll(".res-btn");
    resButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const [w, h] = btn.dataset.size.split("x").map(Number);
            const dpr = window.devicePixelRatio || 1;

            manualResize = true;

            const prevZoom = zoom;
            const prevOffsetX = offsetX;
            const prevOffsetY = offsetY;

            canvas.width = w * dpr;
            canvas.height = h * dpr;
            const scale = window.innerHeight / (h * dpr);
            canvas.style.width = (w * dpr * scale) + "px";
            canvas.style.height = window.innerHeight + "px";


            canvas.style.aspectRatio = w + " / " + h;


            gl.viewport(0, 0, canvas.width, canvas.height);


            draw();
        });
    });






    function updateBackground() {
        const canvas = document.getElementById("glcanvas");
        canvas.style.backgroundImage = "none";
        canvas.style.backgroundColor = "";

        if (currentGradient === "none") {
            canvas.style.backgroundColor = "#2A2A2A";
            canvas.style.backgroundSize = "100% 100%";
            canvas.style.backgroundRepeat = "no-repeat";
            canvas.style.backgroundPosition = "center";

        }
        else if (!currentGradient) {
            const hour = new Date(time).getUTCHours();
            const entry = gradientMap.find(e => hour >= e.from && hour < e.to) || gradientMap[0];
            canvas.style.backgroundImage = `linear-gradient(to bottom, ${entry.gradients[0].join(",")})`;
            canvas.style.backgroundSize = "100% 100%";
            canvas.style.backgroundRepeat = "no-repeat";
            canvas.style.backgroundPosition = "center";
        }
        else {
            canvas.style.backgroundImage = `linear-gradient(to bottom, ${currentGradient.join(",")})`;
            canvas.style.backgroundSize = "100% 100%";
            canvas.style.backgroundRepeat = "no-repeat";
            canvas.style.backgroundPosition = "center";

        }
    }




    function animate() {
        requestAnimationFrame(animate);

        const now = performance.now();
        const delta = now - lastFrameTime;
        lastFrameTime = now;

        if (!isPaused) {
            if (useRealTime) {
                const offset = 3 * 60 * 60 * 1000; 
                time = Date.now() + offset;
            }
            else {
                time += timeSpeed * (delta / 1000);
            }
            updateStarBuffer();
            updateConstellationBuffer();
            updateBackground();
        }

        updateTimeDisplay();
        draw();
    }




    animate();

    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    const pauseBtn = document.getElementById("pauseBtn");
    const resetTimeBtn = document.getElementById("resetTime");

    if (pauseBtn && resetTimeBtn) {
        pauseBtn.addEventListener("click", () => {
            isPaused = !isPaused;
            pauseBtn.classList.toggle("active", isPaused);
        });

        resetTimeBtn.addEventListener("click", () => {
            const offsetMs = new Date().getTimezoneOffset() * 60 * 1000;
            time = Date.now() - offsetMs + (3 * 60 * 60 * 1000);
            useRealTime = true;

            updateStarBuffer();
        });
    }




    const speedSlider = document.getElementById("speedSlider");
    const speedValueEl = document.getElementById("speedValue");

    speedSlider.value = 5;
    timeSpeed = 5 * 60 * 60 * 1000;
    updateSlider(speedSlider, speedValueEl, null, false);


    speedSlider.addEventListener("input", () => {
        const value = parseInt(speedSlider.value);
        if (value === 0) {
            useRealTime = true;
            speedValueEl.textContent = "Сейчас";
        } else {
            useRealTime = false;
            timeSpeed = value * 60 * 60 * 1000;
            speedValueEl.textContent = `×${value}`;
        }

        updateSlider(speedSlider, speedValueEl, null, false);
    });



    const gradContainer = document.querySelector(".gradient-buttons");
    const gradButtons = Array.from(gradContainer.querySelectorAll(".gradient-btn"));

    gradContainer.addEventListener("click", (e) => {
        const btn = e.target.closest(".gradient-btn");
        if (!btn) return;

        gradButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        const val = btn.dataset.value;
        if (val === "auto") currentGradient = null;
        else if (val === "none") currentGradient = "none";
        else {
            const [mi, gj] = val.split("-").map(Number);
            currentGradient = gradientMap[mi].gradients[gj];
        }

        updateBackground();
        draw();
    });

    const tooltipEl = document.getElementById("tooltip");

    document.querySelectorAll(".tooltip-container").forEach(el => {
        const text = el.getAttribute("data-tooltip");

        el.addEventListener("mouseenter", () => {
            tooltipEl.textContent = text;
            tooltipEl.style.display = "block";
            tooltipEl.style.opacity = "1";
        });

        el.addEventListener("mousemove", e => {
            tooltipEl.style.left = `${e.clientX + 12}px`;
            tooltipEl.style.top = `${e.clientY + 12}px`;
        });

        el.addEventListener("mouseleave", () => {
            tooltipEl.style.display = "none";
            tooltipEl.style.opacity = "0";
        });
    });

    const logoToggle = document.getElementById("logo-toggle");
const logoContainer = document.getElementById("logo-container");

logoToggle.addEventListener("click", () => {
  logoContainer.classList.toggle("expanded");
});

});

function updateSlider(slider, valueElement, progressElement, isLatitude) {
    const percent = (slider.value - slider.min) / (slider.max - slider.min) * 100;
    const value = slider.value;

    if (isLatitude) {
        valueElement.textContent = value + '°';
    } else if (valueElement.id === "speedValue") {
        valueElement.textContent = `×${value}`;
    } else {
        valueElement.textContent = value;
    }

    valueElement.style.setProperty('--value-pos', percent + '%');

    const minPercent = 8;
    const maxPercent = 92;
    const adjustedPercent = Math.max(minPercent, Math.min(maxPercent, percent));
    valueElement.style.left = adjustedPercent + '%';

    const progressElementEl = slider.closest('.slider-track')?.querySelector('.slider-progress');
    if (progressElementEl) {
        progressElementEl.style.setProperty('--progress', percent + '%');
    }
}


