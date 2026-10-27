// Entry point: register the background playback service before the router mounts.
import TrackPlayer from 'react-native-track-player';
import { PlaybackService } from './src/player/service';
import 'expo-router/entry';

TrackPlayer.registerPlaybackService(() => PlaybackService);
