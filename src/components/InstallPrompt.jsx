import { useEffect, useState } from 'react';

export default function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [showPrompt, setShowPrompt] = useState(false);

    useEffect(() => {
        const isIOS = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
        const isInStandaloneMode = 'standalone' in window.navigator && window.navigator.standalone;

        if (isIOS && !isInStandaloneMode) {
            setShowPrompt(true);
        }

        const handleBeforeInstallPrompt = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setShowPrompt(true);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstall = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                console.log('App installed');
                setShowPrompt(false);
            }
        }
    };

    const handleClose = () => {
        setShowPrompt(false);
    };

    if (!showPrompt) return null;

    return (
        <div
            style={{
                position: 'fixed',
                bottom: 10,
                left: 10,
                right: 10,
                padding: 16,
                backgroundColor: '#f0f0f0',
                borderRadius: 8,
                boxShadow: '0 0 10px rgba(0,0,0,0.2)',
                zIndex: 9999,
                textAlign: 'center',
                // 
                // 
                // 
                // 
                // 
                // 
                display: 'none'
                // 
                // 
                // 
                // 
                // 
            }}
        >
            {/* Close Button */}
            <button
                onClick={handleClose}
                style={{
                    position: 'absolute',
                    top: 8,
                    right: 12,
                    background: 'none',
                    border: 'none',
                    fontSize: 18,
                    cursor: 'pointer',
                    color: 'red',
                }}
            >
                ✕
            </button>

            <p style={{ marginBottom: 10 }}>
                Install <strong>EventBooking App</strong> to your home screen.
            </p>

            {deferredPrompt ? (
                <button
                    onClick={handleInstall}
                    style={{
                        padding: '10px 20px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 16,
                    }}
                >
                    Install
                </button>
            ) : (
                <p>
                    Tap <strong>Share</strong> → <strong>Add to Home Screen</strong>
                </p>
            )}
        </div>
    );

}
