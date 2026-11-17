export const patchFileReaderForImageCompression = () => {
    const originalReadAsDataURL = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (blob) {
        if (blob instanceof Blob && blob.type.startsWith('image/')) {
            const internalReader = new FileReader();
            internalReader.onload = (e) => {
                const result = e.target?.result as string;
                if (!result) {
                    originalReadAsDataURL.call(this, blob);
                    return;
                }

                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const maxDim = 420;

                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            height = Math.round(height * (maxDim / width));
                            width = maxDim;
                        } else {
                            width = Math.round(width * (maxDim / height));
                            height = maxDim;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(img, 0, 0, width, height);
                        const dataUrl = canvas.toDataURL('image/jpeg', 0.68);

                        fetch(dataUrl)
                            .then(res => res.blob())
                            .then(compressedBlob => {
                                originalReadAsDataURL.call(this, compressedBlob);
                            })
                            .catch(() => {
                                originalReadAsDataURL.call(this, blob);
                            });
                    } else {
                        originalReadAsDataURL.call(this, blob);
                    }
                };
                img.onerror = () => {
                    originalReadAsDataURL.call(this, blob);
                };
                img.src = result;
            };
            originalReadAsDataURL.call(internalReader, blob);
        } else {
            originalReadAsDataURL.call(this, blob);
        }
    };
};

export const compressImageForCloud = async (src: string | undefined | null, fallbackName = 'Artist', maxLength = 180000): Promise<string> => {
    if (!src) {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=18181b&color=ef4444`;
    }
    if (!src.startsWith('data:')) {
        return src.slice(0, 2000);
    }
    if (src.length <= maxLength) {
        return src;
    }

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxDim = 256;
            let width = img.width;
            let height = img.height;
            if (width > maxDim || height > maxDim) {
                if (width > height) {
                    height = Math.round(height * (maxDim / width));
                    width = maxDim;
                } else {
                    width = Math.round(width * (maxDim / height));
                    height = maxDim;
                }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(`https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=18181b&color=ef4444`);
                return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', 0.55);
            if (compressed.length <= maxLength) {
                resolve(compressed);
            } else {
                const tiny = canvas.toDataURL('image/jpeg', 0.35);
                resolve(tiny.length <= maxLength ? tiny : `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=18181b&color=ef4444`);
            }
        };
        img.onerror = () => {
            resolve(`https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=18181b&color=ef4444`);
        };
        img.src = src;
    });
};

export const syncCompressImageString = (src: string | undefined | null, fallbackName = 'Artist', maxLength = 220000): string => {
    if (!src) {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=18181b&color=ef4444`;
    }
    if (src.startsWith('data:')) {
        if (src.length <= maxLength) return src;
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=18181b&color=ef4444`;
    }
    return src.slice(0, 2000);
};
