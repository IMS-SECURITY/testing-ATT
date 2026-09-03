// Haversine distance in km
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function getCurrentPosition(options?: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error("Location is not detected: Geolocation is not supported on this device or browser."));
    }

    let completed = false;
    let watchId: number | null = null;
    let bestPosition: GeolocationPosition | null = null;

    // Safety timeout of 7 seconds to resolve with the best coordinates collected so far.
    const timeoutId = setTimeout(() => {
      cleanup();
      if (bestPosition) {
        resolve(bestPosition);
      } else {
        reject(new Error("Location is not detected: Request timed out. Please ensure GPS is enabled and location permission is granted."));
      }
    }, 7000);

    const success = (position: GeolocationPosition) => {
      bestPosition = position;
      // If we achieve excellent accuracy (<= 60 meters), resolve immediately.
      if (position.coords.accuracy <= 60) {
        cleanup();
        resolve(position);
      }
    };

    const failure = (error: GeolocationPositionError) => {
      // If we haven't received any position yet, propagate error. Otherwise, we can ignore and wait for timeout to return the last known good position.
      if (!bestPosition) {
        cleanup();
        let message = "Location is not detected. Please ensure GPS is enabled and try again.";
        if (error.code === error.PERMISSION_DENIED) {
          message = "Location is not detected: Permission not granted. Please allow location access in your browser settings.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message = "Location is not detected: GPS signal unavailable. Please ensure your device location is turned on.";
        } else if (error.code === error.TIMEOUT) {
          message = "Location is not detected: Request timed out. Please check your GPS signal and try again.";
        }
        reject(new Error(message));
      }
    };

    watchId = navigator.geolocation.watchPosition(success, failure, {
      enableHighAccuracy: true,
      maximumAge: 0, // Force fresh coordinates
      timeout: 6000,
      ...options,
    });

    function cleanup() {
      if (completed) return;
      completed = true;
      clearTimeout(timeoutId);
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    }
  });
}
