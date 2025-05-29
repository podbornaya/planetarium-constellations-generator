import { stars } from './stars.js';
const asterisms = window.asterisms.flatMap(c => c.lines);



// Словарь: HIP → звезда
const starMap = new Map();
for (const star of stars) {
    starMap.set(star.hip, star);
}

// В начале файла оставляем объявление градиентов и currentGradient как есть
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

// в начале файла, сразу после gradientMap
const noneGradient = ['#000000'];                   // чисто чёрный, любая длина.  
gradientMap.push({ from: 0, to: 24, gradients: [noneGradient] });


let currentGradient = null; // null = авто


window.addEventListener("DOMContentLoaded", () => {

    const magnitudeSlider = document.getElementById("magLimit");
    const magValueEl = document.getElementById("magValue");        // ← здесь
    const latSlider = document.getElementById("latitude");
    latSlider.min = -89;
    latSlider.max = 89;
    const latValueEl = document.getElementById("latValue");       // ← и здесь
    const toggleConstellationsOnly = document.getElementById("toggleConstellationsOnly");
    const autoLatBtn = document.getElementById("getLocation");

    const constellationBuffers = [];




    magnitudeSlider.addEventListener("input", () => {
        maxMagnitude = parseFloat(magnitudeSlider.value);
        // двигаем прогресс и «плашку»
        updateSlider(magnitudeSlider, magValueEl, null, false);
        updateStarBuffer();
    });




    let observerLat = 0; // широта наблюдателя
    let maxMagnitude = 4.5; // Значение по умолчанию (как в вашем коде)
    let avgSize = 16; // по умолчанию, если updateStarBuffer не вызывался
    let showOnlyConstellations = true; // Всегда показываем только созвездия
    let pointCount = 0;
    let time = Date.now();           // текущее виртуальное время
    let timeSpeed = 60 * 60 * 1000;  // миллисекунд за 1 секунду — 1 час в сек.
    let isPaused = false;
    let lastFrameTime = performance.now();
    let useRealTime = true;   // стартуем сразу в реальном времени
    let manualResize = false;



    const constellationDotBuffers = [];
    let constellationDotCount = 0;
    let positions = []; // <-- сделаем глобально доступной




    const canvas = document.getElementById("glcanvas");
    // при создании контекста включаем альфу
    const gl = canvas.getContext("webgl", { alpha: true });
    // очищаем в прозрачный фон
    gl.clearColor(0, 0, 0, 0);

    const sizeBuffer = gl.createBuffer();


    function resizeCanvas() {
        if (manualResize) return;

        // Сохраняем текущие параметры масштабирования и смещения
        const prevZoom = zoom;
        const prevOffsetX = offsetX;
        const prevOffsetY = offsetY;

        const fixedWidth = 3456;
        const fixedHeight = 2234;

        // высокое внутреннее разрешение для рисования
        canvas.width = fixedWidth;
        canvas.height = fixedHeight;

        // но отображаем canvas в размере окна
        canvas.style.width = window.innerWidth + "px";
        canvas.style.height = window.innerHeight + "px";

        gl.viewport(0, 0, fixedWidth, fixedHeight);

        // Восстанавливаем параметры масштабирования и смещения
        zoom = prevZoom;
        offsetX = prevOffsetX;
        offsetY = prevOffsetY;

        draw();
    }




    // В начале кода добавьте сброс трансформации:
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);


    if (!gl) {
        alert("WebGL не поддерживается");
    }

    // === Управление zoom и сдвигом ===
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

        // Возвращаем координаты в диапазоне [0, 1] без фильтрации
        const x = az / (2 * Math.PI);
        const y = (alt + Math.PI / 2) / Math.PI;
        return [x, y];
    }

    function isLineShort3D(star1, star2, maxAngleDeg = 15) { // Уменьшили порог до 10°
        const ra1 = star1.ra * 15 * Math.PI / 180; // Переводим часы в градусы, затем в радианы
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

        // Координаты курсора в нормализованных координатах [0,1]
        const rect = canvas.getBoundingClientRect();
        const mx = (event.clientX - rect.left) / rect.width;
        const my = (event.clientY - rect.top) / rect.height;

        // Корректировка смещения для зума от курсора
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

        offsetX += (dx / canvas.width) / zoom;
        offsetY += (dy / canvas.height) / zoom;


        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        draw();
    });


    canvas.addEventListener("mouseup", () => { isDragging = false; });
    canvas.addEventListener("mouseleave", () => { isDragging = false; });

    // === Шейдеры ===
    // Модифицируем vertex shader для управления размером точек:
    const vertexShaderSource = `
precision mediump float;
attribute float a_size;
attribute vec2 a_position;
uniform float u_zoom;
uniform vec2 u_offset;
uniform float u_pointMode;
uniform float u_pointSize;

void main() {
    vec2 centered = (a_position - 0.5) * 2.0;
    vec2 scaled = centered * u_zoom + u_offset;
    gl_Position = vec4(scaled * vec2(1.0, -1.0), 0.0, 1.0);

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



    // В fragment shader добавьте проверку:
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


    // В функции updateStarBuffer() добавьте расчет размеров звезд:
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

        // Фильтруем и обрабатываем звёзды только один раз
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
        const seenDots = [];
        constellationDotBuffers.length = 0;

        const DOT_SPACING = 0.01; // 1% от canvas (или подбери визуально)


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
                        return dx * dx + dy * dy < 0.00001; // ← настраиваемый порог, можно ужесточить
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
        if (!positions || positions.length === 0) return;

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        for (let i = 0; i < positions.length; i += 2) {
            const x = positions[i];
            const y = positions[i + 1];
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }

        // Добавляем небольшой отступ (padding)
        const padding = 0.05;
        minX = Math.max(0, minX - padding);
        maxX = Math.min(1, maxX + padding);
        minY = Math.max(0, minY - padding);
        maxY = Math.min(1, maxY + padding);

        const width = maxX - minX;
        const height = maxY - minY;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;


        // Добавь ограничение минимального zoom
        const MIN_ZOOM = 1; // Можно увеличить до 0.7-1.0, если нужно
        zoom = Math.max(zoom, MIN_ZOOM);

        // Рассчитываем zoom для вписывания в canvas
        const canvasAspect = canvas.width / canvas.height;
        const contentAspect = width / height;

        if (contentAspect > canvasAspect) {
            // Широкое содержимое - ограничено по ширине
            zoom = 1 / width;
        } else {
            // Высокое содержимое - ограничено по высоте
            zoom = 1 / height;
        }

        // Уменьшаем zoom для небольшого отступа
        zoom *= 0.9;

        // Центрирование
        offsetX = 0.5 - centerX * zoom;
        offsetY = 0.5 - centerY * zoom;

        draw();
        console.log('Bounds:', { minX, maxX, minY, maxY, zoom, offsetX, offsetY });
    }



    latSlider.addEventListener("input", () => {
        observerLat = parseFloat(latSlider.value);
        // двигаем прогресс и «плашку» (updateSlider сам обновит текст на °)
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

            updateLatDisplay(observerLat); // ← добавляем это
            updateStarBuffer();
        });


    });




    const vShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    const program = createProgram(gl, vShader, fShader);

    gl.useProgram(program);

    // 1. Загрузка SVG в Image и создание WebGL-текстуры
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

        observerLat = parseFloat(document.getElementById("latitude").value);
        updateLatDisplay(observerLat);

        updateStarBuffer();             // ← только здесь!
        updateConstellationBuffer();
        fitStarsToView();
    };




    // === Атрибуты и uniform-переменные ===
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    const positionLocation = gl.getAttribLocation(program, "a_position");
    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    const zoomLocation = gl.getUniformLocation(program, "u_zoom");
    const offsetLocation = gl.getUniformLocation(program, "u_offset");
    const pointModeLocation = gl.getUniformLocation(program, "u_pointMode"); // ⬅️ здесь






    // === Рендер ===
    function draw() {
        if (!starTexture) return; // ← не рисуем, если текстура ещё не готова

        gl.clear(gl.COLOR_BUFFER_BIT);

        const sizeLocation = gl.getAttribLocation(program, "a_size");
        gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuffer);
        gl.enableVertexAttribArray(sizeLocation);
        gl.vertexAttribPointer(sizeLocation, 1, gl.FLOAT, false, 0, 0);


        // Устанавливаем параметры для отрисовки
        gl.uniform2f(resolutionLocation, 1.0, 1.0);
        gl.uniform1f(zoomLocation, zoom);
        gl.uniform2f(offsetLocation, offsetX, offsetY);

        // Рисуем все звёзды
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        // Включаем blending для прозрачности
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Привязываем текстуру звезды
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, starTexture);
        gl.uniform1i(gl.getUniformLocation(program, 'u_sprite'), 0);

        // Устанавливаем цвет звезды (белый)
        gl.uniform4fv(gl.getUniformLocation(program, 'u_color'), [1, 1, 1, 1]);

        // Режим отрисовки точек (звезд)
        gl.uniform1f(pointModeLocation, 0.0);

        // Рисуем звезды
        gl.drawArrays(gl.POINTS, 0, pointCount);


        // Рисуем квадраты вдоль линий (без текстуры)
        for (const { buffer, count } of constellationDotBuffers) {
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.enableVertexAttribArray(positionLocation);
            gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

            gl.uniform1f(pointModeLocation, 2.0);
            gl.uniform4fv(gl.getUniformLocation(program, 'u_color'), [1, 1, 1, 1]);

            const squareSize = avgSize / 3;
            gl.uniform1f(gl.getUniformLocation(program, 'u_pointSize'), squareSize); // <-- ВАЖНО

            gl.drawArrays(gl.POINTS, 0, count);
        }

        updateBackground();
    }

    // Добавьте этот код в конец обработчика DOMContentLoaded в webgl.js

    // Функция для экспорта SVG
    function exportToSVG() {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const dpr = window.devicePixelRatio || 1;
        
        // Используем текущие размеры canvas, а не window
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;
    
        svg.setAttribute('width', width);
        svg.setAttribute('height', height);
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    
        // Добавляем фон (остаётся без изменений)
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
    
        // Добавляем звёзды с учётом зума и смещения
        const starSize = avgSize / dpr;
        for (let i = 0; i < pointCount; i++) {
            // Применяем зум и смещение к координатам
            let x = (positions[i * 2] - 0.5) * zoom + 0.5 + offsetX;
            let y = (positions[i * 2 + 1] - 0.5) * zoom + 0.5 + offsetY;
    
            // Конвертируем в абсолютные координаты SVG
            x = x * width;
            y = y * height;
    
            const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
            use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#star-symbol");
            use.setAttribute("x", x - starSize / 2);
            use.setAttribute("y", y - starSize / 2);
            use.setAttribute("width", starSize);
            use.setAttribute("height", starSize);
            svg.appendChild(use);
        }
    
        // Добавляем линии созвездий с учётом зума и смещения
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
    
                // Применяем зум и смещение к координатам
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
    
        // Преобразуем SVG в строку и скачиваем (без изменений)
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

    // Добавляем обработчик для кнопки экспорта SVG
    document.getElementById('saveSvgBtn')?.addEventListener('click', exportToSVG);

    document.getElementById('resetViewBtn')?.addEventListener('click', () => {
        fitStarsToView(); // вместо ручного zoom=1 и offset=0
    });


    // — Управление разрешением —
    // — Управление разрешением —
    const resButtons = document.querySelectorAll(".res-btn");
    resButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const [w, h] = btn.dataset.size.split("x").map(Number);
            const dpr = window.devicePixelRatio || 1;

            manualResize = true;

            // Сохраняем текущие параметры масштабирования и смещения
            const prevZoom = zoom;
            const prevOffsetX = offsetX;
            const prevOffsetY = offsetY;

            // Устанавливаем новые размеры
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            canvas.style.width = w + "px";
            canvas.style.height = h + "px";

            gl.viewport(0, 0, canvas.width, canvas.height);

            // Восстанавливаем параметры масштабирования и смещения
            zoom = prevZoom;
            offsetX = prevOffsetX;
            offsetY = prevOffsetY;

            // Центрируем изображение
            offsetX = (1 - (w / 3456) * zoom) / 2;
            offsetY = (1 - (h / 2234) * zoom) / 2;

            draw();
        });
    });






    // Исправленная функция updateBackground
    function updateBackground() {
        const canvas = document.getElementById("glcanvas");
        // сбросим всё
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
            // Добавляем эти строки:
            canvas.style.backgroundSize = "100% 100%";
            canvas.style.backgroundRepeat = "no-repeat";
            canvas.style.backgroundPosition = "center";
        }
        else {
            canvas.style.backgroundImage = `linear-gradient(to bottom, ${currentGradient.join(",")})`;
            // И эти:
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
                time = Date.now();
            } else {
                time += timeSpeed * (delta / 1000);
            }
            updateStarBuffer();
            updateConstellationBuffer();
            updateBackground(); // Добавлено обновление фона
        }

        updateTimeDisplay();
        draw();
    }




    animate();

    // === Инициализация после подготовки шейдеров ===
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    // Управление временем через UI
    const pauseBtn = document.getElementById("pauseBtn");
    const resetTimeBtn = document.getElementById("resetTime");

    if (pauseBtn && resetTimeBtn) {
        pauseBtn.addEventListener("click", () => {
            isPaused = !isPaused;
            pauseBtn.classList.toggle("active", isPaused);
        });

        resetTimeBtn.addEventListener("click", () => {
            time = Date.now();
            useRealTime = true;
            updateStarBuffer();
        });
    }




    const speedSlider = document.getElementById("speedSlider");
    const speedValueEl = document.getElementById("speedValue");

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

        // Обновить внешний вид ползунка
        updateSlider(speedSlider, speedValueEl, null, false);
    });



    // Делегирование кликов по кнопкам градиента
    const gradContainer = document.querySelector(".gradient-buttons");
    const gradButtons = Array.from(gradContainer.querySelectorAll(".gradient-btn"));

    gradContainer.addEventListener("click", (e) => {
        const btn = e.target.closest(".gradient-btn");
        if (!btn) return;  // клик не на кнопке

        // переключаем active-класс
        gradButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        // определяем выбранный градиент
        const val = btn.dataset.value;
        if (val === "auto") currentGradient = null;
        else if (val === "none") currentGradient = "none";
        else {
            const [mi, gj] = val.split("-").map(Number);
            currentGradient = gradientMap[mi].gradients[gj];
        }

        // сразу обновляем фон и перерисовываем canvas
        updateBackground();
        draw();
    });



});

function updateSlider(slider, valueElement, progressElement, isLatitude) {
    const percent = (slider.value - slider.min) / (slider.max - slider.min) * 100;
    const value = slider.value;

    valueElement.textContent = isLatitude ? value + '°' : value;
    valueElement.style.setProperty('--value-pos', percent + '%');

    const minPercent = 5;
    const maxPercent = 95;
    const adjustedPercent = Math.max(minPercent, Math.min(maxPercent, percent));
    valueElement.style.left = adjustedPercent + '%';

    const progressElementEl = slider.closest('.slider-track')?.querySelector('.slider-progress');
    if (progressElementEl) {
        progressElementEl.style.setProperty('--progress', percent + '%');
    }
}
