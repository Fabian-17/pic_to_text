import { Dimensions, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const { width: W, height: H } = Dimensions.get('window');
const MAX_SCALE = 12;

interface Props {
  uri: string;
}

export function ZoomableImage({ uri }: Props) {
  const scale      = useSharedValue(1);
  const baseScale  = useSharedValue(1);
  const tx         = useSharedValue(0);
  const ty         = useSharedValue(0);
  const baseTx     = useSharedValue(0);
  const baseTy     = useSharedValue(0);

  const reset = () => {
    'worklet';
    scale.value     = withTiming(1);
    baseScale.value = 1;
    tx.value        = withTiming(0);
    ty.value        = withTiming(0);
    baseTx.value    = 0;
    baseTy.value    = 0;
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      baseScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(MAX_SCALE, baseScale.value * e.scale));
    })
    .onEnd(() => {
      baseScale.value = scale.value;
      if (scale.value <= 1) reset();
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      tx.value = baseTx.value + e.translationX;
      ty.value = baseTy.value + e.translationY;
    })
    .onEnd(() => {
      baseTx.value = tx.value;
      baseTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        reset();
      } else {
        scale.value     = withTiming(2.5);
        baseScale.value = 2.5;
      }
    });

  const gesture = Gesture.Simultaneous(
    Gesture.Exclusive(doubleTap, pan),
    pinch
  );

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.Image
        source={{ uri }}
        style={[styles.image, animStyle]}
        resizeMode="contain"
      />
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  image: {
    width: W,
    height: H,
  },
});
