import React, { useState, useEffect, useRef } from 'react';
import {
  AppBar, Toolbar, IconButton, Typography, Container, Box, TextField, Button, Alert, CircularProgress, InputAdornment, Card, CardMedia, CardContent, LinearProgress, Stack, Drawer, List, ListItem, ListItemButton, ListItemAvatar, Avatar, ListItemText, Divider, useMediaQuery, Tooltip, MenuItem, Chip, Snackbar, Switch, FormControlLabel, Menu, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import FolderIcon from '@mui/icons-material/Folder';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import CloseIcon from '@mui/icons-material/Close';
import PaletteIcon from '@mui/icons-material/Palette';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CancelIcon from '@mui/icons-material/Cancel';
import { useTheme } from '@mui/material/styles';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { blue, teal, deepPurple, pink, green, orange } from '@mui/material/colors';
import InfoIcon from '@mui/icons-material/Info';

const isElectron = !!(window && window.electronAPI);

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatSpeed(speed) {
  return speed ? formatBytes(speed) + '/s' : '--';
}

function formatETA(eta) {
  if (!eta) return '--';
  const m = Math.floor(eta / 60);
  const s = eta % 60;
  return `${m}m ${s}s`;
}

const HISTORY_KEY = 'yt_download_history';
const SIDEBAR_WIDTH = 220; // was 300
const SIDEBAR_WIDTH_MOBILE = 140; // was 200
const SIDEBAR_COLLAPSED = 56;

const COLOR_OPTIONS = [
  { name: 'Blue', value: blue },
  { name: 'Teal', value: teal },
  { name: 'Deep Purple', value: deepPurple },
  { name: 'Pink', value: pink },
  { name: 'Green', value: green },
  { name: 'Orange', value: orange },
];

const API_BASE_URL = "https://yt-downlader-hujz.onrender.com";

function App() {
  const [urlInput, setUrlInput] = useState('');
  const [urls, setUrls] = useState([]);
  const [downloadDir, setDownloadDir] = useState(isElectron ? '' : 'downloads');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState({ title: '', thumbnail: '' });
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [history, setHistory] = useState([]);
  const [progressMap, setProgressMap] = useState({}); // { url: { percent, status, ... } }
  const wsRef = useRef(null);
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('sm'));
  const isMdUp = useMediaQuery(muiTheme.breakpoints.up('md'));
  const isWide = useMediaQuery('(min-width:658px)');
  const [sidebarOpen, setSidebarOpen] = useState(isWide);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [primaryColor, setPrimaryColor] = useState(() => {
    const saved = localStorage.getItem('yt_primary_color');
    return saved ? JSON.parse(saved) : 'Blue';
  });
  const [themeMenuAnchor, setThemeMenuAnchor] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });
  const [dragActive, setDragActive] = useState(false);
  const [dropModeBatch, setDropModeBatch] = useState(true); // true: add to batch, false: immediate download
  const downloadDirRef = useRef(downloadDir);
  const [releaseAssets, setReleaseAssets] = useState({ mac: null, win: null });
  const [downloadModal, setDownloadModal] = useState({ open: false, video: null });
  const [videoMetadata, setVideoMetadata] = useState(null);

  const theme = createTheme({
    palette: {
      primary: {
        main: COLOR_OPTIONS.find(opt => opt.name === primaryColor)?.value[500] || blue[500],
      },
    },
  });

  useEffect(() => {
    localStorage.setItem('yt_primary_color', JSON.stringify(primaryColor));
  }, [primaryColor]);

  useEffect(() => {
    downloadDirRef.current = downloadDir;
  }, [downloadDir]);

  useEffect(() => {
    // Fetch latest GitHub release assets
    fetch('https://api.github.com/repos/Stanley-24/yt-downlader/releases/latest')
      .then(res => res.json())
      .then(data => {
        if (data.assets) {
          const macAsset = data.assets.find(a => a.name.endsWith('.dmg'));
          const winAsset = data.assets.find(a => a.name.endsWith('.exe'));
          setReleaseAssets({
            mac: macAsset ? macAsset.browser_download_url : null,
            win: winAsset ? winAsset.browser_download_url : null,
          });
        }
      })
      .catch(() => setReleaseAssets({ mac: null, win: null }));
  }, []);

  // 1. Sidebar open/collapsed logic
  useEffect(() => {
    setSidebarOpen(isWide);
    setSidebarCollapsed(false);
  }, [isWide]);

  // Sidebar toggle handler
  const handleSidebarToggle = () => {
    if (isWide) setSidebarCollapsed((prev) => !prev);
    else setSidebarMobileOpen((open) => !open);
  };

  // 2. Theme switcher in AppBar
  useEffect(() => {
    // Update sidebar state on screen size change
    setSidebarOpen(isWide);
  }, [isWide]);

  // Load history from localStorage
  useEffect(() => {
    const h = localStorage.getItem(HISTORY_KEY);
    if (h) setHistory(JSON.parse(h));
  }, []);

  // Save history to localStorage (debounced to prevent excessive writes)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }, 1000); // Save after 1 second of no changes
    
    return () => clearTimeout(timeoutId);
  }, [history]);

  // Parse URLs whenever urlInput changes
  useEffect(() => {
    const parsed = urlInput
      .split(/\s|,|;/)
      .map(u => u.trim())
      .filter(u => u.length > 0);
    setUrls(parsed);
  }, [urlInput]);

  useEffect(() => {
    if (!urls.length) {
      setMeta({ title: '', thumbnail: '' });
      setMetaError(null);
      return;
    }
    // Only fetch if looks like a YouTube URL
    if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(urls[0])) {
      setMeta({ title: '', thumbnail: '' });
      setMetaError(null);
      return;
    }
    setMetaLoading(true);
    setMetaError(null);
    fetch(`${API_BASE_URL}/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urls[0] })
    })
      .then(res => res.json())
      .then(data => {
        if (data.detail) {
          setMetaError('Could not fetch video info.');
          setMeta({ title: '', thumbnail: '' });
        } else {
          setMeta({ title: data.title, thumbnail: data.thumbnail });
        }
      })
      .catch(() => {
        setMetaError('Could not fetch video info.');
        setMeta({ title: '', thumbnail: '' });
      })
      .finally(() => setMetaLoading(false));
  }, [urls]);

  // WebSocket for progress
  useEffect(() => {
    if (wsRef.current) return; // Only connect once
    const ws = new window.WebSocket('wss://yt-downlader-hujz.onrender.com/ws/progress');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('WebSocket message received:', data); // Debug log
      
      if (data.url) {
        setProgressMap(prev => ({
          ...prev,
          [data.url]: data
        }));
      }
      
      if (data.status === 'downloading') {
        setProgress(data);
      } else if (data.status === 'finished') {
        console.log('Download finished, updating history:', data); // Debug log
        const newHistoryItem = {
          title: data.title || '',
          thumbnail: data.thumbnail || '',
          url: data.url,
          downloadDir: data.downloadDir || downloadDirRef.current,
          date: new Date().toISOString(),
          status: 'Completed',
          filename: data.filename || '',
        };
        
        setHistory(prev => [newHistoryItem, ...prev]);
        setProgress(null);
        
        // Immediately open modal for finished downloads
        console.log('Opening modal immediately for finished download'); // Debug log
        setDownloadModal({ open: true, video: newHistoryItem });
        fetchVideoMetadata(data.url);
      }
    };
    wsRef.current = ws;
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  // Request notification permission on mount
  useEffect(() => {
    if (window.Notification && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Show notification when a download finishes or errors
  useEffect(() => {
    const finishedDownloads = Object.values(progressMap).filter(p => 
      p && p.status === 'finished' && !p._notified
    );
    
    finishedDownloads.forEach((p) => {
      if (window.Notification && Notification.permission === 'granted') {
        new window.Notification('Download Complete', {
          body: p.filename ? p.filename : p.url,
        });
      }
      p._notified = true;
    });
  }, [progressMap]);

  const handleSelectFolder = async () => {
    if (window.electronAPI && window.electronAPI.selectFolder) {
      const folder = await window.electronAPI.selectFolder();
      if (folder) setDownloadDir(folder);
    }
  };

  // Update handleSubmit for batch
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    setProgress(null);
    // Clear the URL input and batch list when download starts
    setUrls([]);
    setUrlInput('');
    try {
      const response = await fetch(`${API_BASE_URL}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, download_dir: downloadDir })
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(data.message);
        // Add to history (for each URL, simplified for now)
        setHistory(prev => [
          ...urls.map(u => ({
            title: '',
            thumbnail: '',
            url: u,
            downloadDir,
            date: new Date().toISOString(),
            status: 'Completed',
            filename: '',
          })),
          ...prev
        ]);
      } else {
        setError(data.detail || 'An error occurred.');
      }
    } catch (err) {
      setError('Could not connect to backend.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenFile = (item) => {
    if (window.electronAPI && window.electronAPI.openPath && item.filename) {
      window.electronAPI.openPath(item.filename);
    }
  };

  const handleClearHistory = () => {
    setHistory([]);
  };

  const handleToggleSidebar = (forceClose = false, forceOpen = false) => {
    if (isMobile) {
      if (forceClose) setSidebarMobileOpen(false);
      else if (forceOpen) setSidebarMobileOpen(true);
      else setSidebarMobileOpen((open) => !open);
    } else {
      setSidebarOpen((open) => !open);
    }
  };

  // Add a function to remove a URL from the batch before starting
  const handleRemoveUrl = (url) => {
    setUrls(urls.filter(u => u !== url));
    setUrlInput(urls.filter(u => u !== url).join('\n'));
  };
  const handleClearBatch = () => {
    setUrls([]);
    setUrlInput('');
  };

  // Pause/Resume/Cancel handlers (stub for now)
  const handlePause = (url) => {
    setSnackbar({ open: true, message: `Pause requested for: ${url}` });
    // TODO: Integrate with backend
  };
  const handleResume = (url) => {
    setSnackbar({ open: true, message: `Resume requested for: ${url}` });
    // TODO: Integrate with backend
  };
  const handleCancel = (url) => {
    setSnackbar({ open: true, message: `Cancel requested for: ${url}` });
    // TODO: Integrate with backend
  };
  const handlePauseAll = () => {
    setSnackbar({ open: true, message: 'Pause All requested' });
    // TODO: Integrate with backend
  };
  const handleResumeAll = () => {
    setSnackbar({ open: true, message: 'Resume All requested' });
    // TODO: Integrate with backend
  };
  const handleCancelAll = () => {
    setSnackbar({ open: true, message: 'Cancel All requested' });
    // TODO: Integrate with backend
  };

  // Drag-and-drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  const processDrop = (dropped) => {
    // Only accept YouTube URLs for now
    const ytRegex = /https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/[\w\-?&=%.]+/g;
    const matches = dropped.match(ytRegex);
    if (!matches) return;
    if (dropModeBatch) {
      // Add to batch
      setUrls(prev => Array.from(new Set([...prev, ...matches])));
      setUrlInput(prev => prev ? prev + '\n' + matches.join('\n') : matches.join('\n'));
      setSnackbar({ open: true, message: 'Added to batch!' });
    } else {
      // Immediate download
      setUrls(matches);
      setUrlInput(matches.join('\n'));
      setTimeout(() => {
        const form = document.getElementById('download-form');
        if (form) form.requestSubmit();
      }, 100);
      setSnackbar({ open: true, message: 'Download started!' });
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    let dropped = '';
    if (e.dataTransfer.items) {
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        if (e.dataTransfer.items[i].kind === 'string') {
          e.dataTransfer.items[i].getAsString((str) => {
            processDrop(str.trim());
          });
          return;
        } else if (e.dataTransfer.items[i].kind === 'file') {
          // Optionally handle file drop here
          // const file = e.dataTransfer.items[i].getAsFile();
          // processFileDrop(file);
        }
      }
    } else if (e.dataTransfer.getData('text')) {
      dropped = e.dataTransfer.getData('text').trim();
      processDrop(dropped);
    }
  };

  // Add the handleDownloadFile function
  const handleDownloadFile = async (item) => {
    let filename = item.filename.split('/').pop();
    // Remove .fXXX format suffixes from filename
    filename = filename.replace(/\.f\d+/, '');
    const url = `${API_BASE_URL}/downloaded-file?filename=${encodeURIComponent(filename)}&download_dir=${encodeURIComponent(item.downloadDir || 'downloads')}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        setSnackbar({ open: true, message: `Download failed.` });
        return;
      }
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
      setSnackbar({ open: true, message: `Download started! Check your Downloads folder for: ${filename}` });
    } catch (err) {
      setSnackbar({ open: true, message: `Download failed.` });
    }
  };

  const handleDownloadFromModal = async (video) => {
    let filename = video.filename.split('/').pop();
    // Remove .fXXX format suffixes from filename
    filename = filename.replace(/\.f\d+/, '');
    const url = `${API_BASE_URL}/downloaded-file?filename=${encodeURIComponent(filename)}&download_dir=${encodeURIComponent(video.downloadDir || 'downloads')}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        setSnackbar({ open: true, message: `Download failed.` });
        return;
      }
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
      setSnackbar({ open: true, message: `Download started! Check your Downloads folder for: ${filename}` });
      setDownloadModal({ open: false, video: null });
    } catch (err) {
      setSnackbar({ open: true, message: `Download failed.` });
    }
  };

  // Auto-open modal when a new video download completes
  useEffect(() => {
    const completedVideos = history.filter(item => 
      item.filename && 
      item.filename.endsWith('.mp4') && 
      item.status === 'Completed'
    );
    
    if (completedVideos.length > 0) {
      const latestVideo = completedVideos[completedVideos.length - 1];
      // Check if this is a new completion (within last 10 seconds)
      const videoAge = Date.now() - new Date(latestVideo.date).getTime();
      if (videoAge < 10000) { // 10 seconds
        console.log('Opening modal for video:', latestVideo); // Debug log
        setDownloadModal({ open: true, video: latestVideo });
        // Fetch video metadata for thumbnail
        fetchVideoMetadata(latestVideo.url);
      }
    }
  }, [history]);

  // Fetch video metadata for thumbnail
  const fetchVideoMetadata = async (url) => {
    if (!url) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/metadata`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url }),
      });
      
      if (response.ok) {
        const metadata = await response.json();
        setVideoMetadata(metadata);
      }
    } catch (error) {
      console.error('Error fetching video metadata:', error);
    }
  };

  // Sidebar content
  const sidebarContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 1, mt: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography
          variant="h6"
          sx={{
            ml: 1,
            textAlign: { xs: 'left', md: 'center' },
            width: '100%',
            display: (sidebarOpen || isMobile) ? 'block' : 'none',
            transition: 'opacity 0.2s',
            opacity: (sidebarOpen || isMobile) ? 1 : 0,
            fontSize: { xs: '1rem', sm: '1.15rem', md: '1.25rem' },
            fontWeight: 600,
            mt: { xs: 2.5, sm: 1, md: 0 },
          }}
        >
          Download History
          <Tooltip title="Downloaded files are saved in your browser's Downloads folder." placement="right">
            <IconButton size="small" sx={{ ml: 1 }}>
              <InfoIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Typography>
        {/* Remove the IconButton for toggling sidebar from here */}
      </Box>
      {/* Show clear button only when open or mobile */}
      {(sidebarOpen || isMobile) && (
        <Button size="small" onClick={handleClearHistory} sx={{ mx: 2, mb: 1 }}>Clear</Button>
      )}
      <Divider />
      <List sx={{ flex: 1, overflowY: 'auto' }}>
        {history.filter(item => item.filename && item.filename.endsWith('.mp4')).length === 0 && <ListItem>{(sidebarOpen || isMobile) ? <ListItemText primary="No downloads yet." /> : <DownloadIcon />}</ListItem>}
        {history.filter(item => item.filename && item.filename.endsWith('.mp4')).map((item, idx) => {
          const displayFilename = item.filename.split('/').pop();
          return (
            <Tooltip key={idx} title={item.title} placement="right">
              <ListItem alignItems="flex-start">
                <ListItemButton>
                  <ListItemAvatar>
                    <Avatar variant="rounded" src={item.thumbnail} alt={item.title} />
                  </ListItemAvatar>
                  {/* Always render ListItemText, but fade/collapse if sidebar is collapsed */}
                  <ListItemText
                    primary={<span>{item.title}<br /><span style={{ fontSize: '0.85em', color: '#888' }}>{displayFilename}</span></span>}
                    secondary={
                      <>
                        <Typography component="span" variant="caption" color="text.secondary">
                          {new Date(item.date).toLocaleString()}<br />
                          {item.status}
                        </Typography>
                      </>
                    }
                    sx={{
                      display: (sidebarOpen || isMobile) ? 'block' : 'none',
                      opacity: (sidebarOpen || isMobile) ? 1 : 0,
                      transition: 'opacity 0.2s',
                    }}
                  />
                </ListItemButton>
              </ListItem>
            </Tooltip>
          );
        })}
      </List>
    </Box>
  );

  // Responsive, themed, web-only download section
  const DownloadSection = () => {
    // muiTheme is available from the parent scope
    if (isElectron || (!releaseAssets.mac && !releaseAssets.win)) return null;
    return (
      <Box sx={{ width: '100%', mb: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography
          variant="subtitle1"
          sx={{ mb: 1, fontWeight: 600, color: muiTheme.palette.primary.main, letterSpacing: 0.5, textAlign: 'center' }}
        >
          Get the Desktop App
        </Typography>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ width: '100%', alignItems: 'center', justifyContent: 'center' }}
        >
          {releaseAssets.mac && (
            <Button
              variant="contained"
              color="primary"
              href={releaseAssets.mac}
              target="_blank"
              startIcon={<DownloadIcon />}
              endIcon={<OpenInNewIcon />}
              size="small"
              fullWidth={isMobile}
              sx={(theme) => ({
                fontWeight: 600,
                fontSize: { xs: '0.95rem', sm: '1rem' },
                borderRadius: { xs: 2, sm: '8px 0 0 8px' },
                textTransform: 'none',
                boxShadow: 'none',
                p: { xs: 1, sm: 1.5 },
                minWidth: 0,
                minHeight: 36,
                '&:hover': { background: theme.palette.primary.dark },
                transition: 'background 0.2s, box-shadow 0.2s',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              })}
            >
              <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                Download for Mac
              </Box>
            </Button>
          )}
          {releaseAssets.win && (
            <Button
              variant="contained"
              color="secondary"
              href={releaseAssets.win}
              target="_blank"
              startIcon={<DownloadIcon />}
              endIcon={<OpenInNewIcon />}
              size="small"
              fullWidth={isMobile}
              sx={(theme) => ({
                fontWeight: 600,
                fontSize: { xs: '0.95rem', sm: '1rem' },
                borderRadius: { xs: 2, sm: '0 8px 8px 0' },
                textTransform: 'none',
                boxShadow: 'none',
                p: { xs: 1, sm: 1.5 },
                minWidth: 0,
                minHeight: 36,
                '&:hover': { background: theme.palette.secondary.dark },
                transition: 'background 0.2s, box-shadow 0.2s',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              })}
            >
              <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                Download for Windows
              </Box>
            </Button>
          )}
        </Stack>
      </Box>
    );
  };

  return (
    <ThemeProvider theme={theme}>
      {/* Beautiful background gradient and blurred shapes */}
      <Box
        sx={{
          position: 'fixed',
          width: '100vw',
          height: '100vh',
          zIndex: -1,
          top: 0,
          left: 0,
          background: 'linear-gradient(120deg, #a1c4fd 0%, #c2e9fb 100%)',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: 'rgba(255, 182, 193, 0.25)',
            filter: 'blur(120px)',
            top: '-200px',
            left: '-200px',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'rgba(135, 206, 250, 0.25)',
            filter: 'blur(100px)',
            bottom: '-100px',
            right: '-100px',
          },
        }}
      />
      <Box sx={{ display: 'flex', minHeight: '100vh', width: '100vw', flexDirection: 'column' }}>
        {/* AppBar for mobile toggle */}
        <AppBar
          position="static"
          elevation={0}
          sx={{
            zIndex: (muiTheme) => muiTheme.zIndex.drawer + 1,
            background: 'transparent',
            backdropFilter: 'none',
            boxShadow: 'none',
            borderBottom: 'none',
            color: 'text.primary',
          }}
        >
          <Toolbar sx={{ minHeight: { xs: 56, sm: 64 }, px: { xs: 1, sm: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              {/* Left: Hamburger/Close icon logic */}
              <Box sx={{ width: 48, display: { xs: 'flex', md: 'none' }, alignItems: 'center', justifyContent: 'flex-start' }}>
                {isMobile ? (
                  sidebarMobileOpen ? (
                    <IconButton onClick={handleSidebarToggle} size="small">
                      <CloseIcon />
                    </IconButton>
                  ) : (
                    <IconButton onClick={handleSidebarToggle} size="small">
                      <MenuIcon />
                    </IconButton>
                  )
                ) : null}
              </Box>
              {/* Center: Title */}
              <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Typography
                  variant="h6"
                  component="div"
                  sx={{
                    fontWeight: 700,
                    letterSpacing: 1,
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    textAlign: 'center',
                    maxWidth: { xs: '80vw', sm: '60vw', md: '40vw' },
                    fontSize: { xs: '1.1rem', sm: '1.25rem', md: '1.5rem' },
                    display: { xs: 'block', md: 'none' },
                  }}
                >
                  YouTube Video Downloader
                </Typography>
              </Box>
              {/* Right: Palette icon (always takes up space) */}
              <Box sx={{ width: 48, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <IconButton color="inherit" onClick={e => setThemeMenuAnchor(e.currentTarget)} size="large">
                  <PaletteIcon />
                </IconButton>
              </Box>
            </Box>
            <Menu
              anchorEl={themeMenuAnchor}
              open={Boolean(themeMenuAnchor)}
              onClose={() => setThemeMenuAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              {COLOR_OPTIONS.map(opt => (
                <MenuItem
                  key={opt.name}
                  selected={primaryColor === opt.name}
                  onClick={() => {
                    setPrimaryColor(opt.name);
                    setThemeMenuAnchor(null);
                  }}
                >
                  <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: opt.value[500], mr: 1, border: primaryColor === opt.name ? '2px solid' : 'none', borderColor: 'primary.main' }} />
                  {opt.name}
                </MenuItem>
              ))}
            </Menu>
          </Toolbar>
        </AppBar>
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Sidebar Drawer for History */}
          <Drawer
            variant={isMobile ? 'temporary' : 'permanent'}
            anchor="left"
            open={isMobile ? sidebarMobileOpen : sidebarOpen}
            onClose={isMobile ? handleToggleSidebar : undefined}
            ModalProps={{ keepMounted: true }}
            sx={{
              width: (sidebarOpen || isMobile)
                ? { xs: SIDEBAR_WIDTH_MOBILE, md: SIDEBAR_WIDTH }
                : SIDEBAR_COLLAPSED,
              flexShrink: 0,
              transition: 'width 0.3s',
              [`& .MuiDrawer-paper`]: {
                width: (sidebarOpen || isMobile)
                  ? { xs: SIDEBAR_WIDTH_MOBILE, md: SIDEBAR_WIDTH }
                  : SIDEBAR_COLLAPSED,
                boxSizing: 'border-box',
                background: '#f5f7fa',
                overflowX: 'hidden',
                transition: 'width 0.3s',
              },
            }}
          >
            {sidebarContent}
          </Drawer>
          {/* Main Content - Redesigned Card */}
          <Container
            maxWidth="sm"
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '100vh',
              bgcolor: 'background.default',
              py: 4,
            }}
          >
            <Box
              sx={{
                width: '100%',
                maxWidth: 480,
                mx: 'auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <DownloadSection />
              {/* Main Card (form, etc.) goes here, remove maxWidth/width from Card itself */}
              <Card
                elevation={6}
                sx={{
                  p: { xs: 2, sm: 4 },
                  borderRadius: 4,
                  width: '100%',
                  boxShadow: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  border: dragActive ? '2px dashed #1976d2' : 'none',
                  background: dragActive ? 'rgba(25, 118, 210, 0.08)' : undefined,
                  transition: 'border 0.2s, background 0.2s',
                }}
              >
                <Typography variant="h5" sx={{ fontWeight: 600, textAlign: 'center', mb: 2, color: 'primary.main' }}>
                  Download videos instantly from YouTube with ease!
                </Typography>
                <FormControlLabel
                  control={<Switch checked={dropModeBatch} onChange={e => setDropModeBatch(e.target.checked)} color="primary" />}
                  label={dropModeBatch ? 'Drop adds to batch' : 'Drop starts download'}
                  sx={{ alignSelf: 'flex-end', mb: 1 }}
                />
                {dragActive && (
                  <Box sx={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    bgcolor: 'rgba(25, 118, 210, 0.10)',
                    borderRadius: 4,
                  }}>
                    <DownloadIcon color="primary" sx={{ fontSize: 60, mr: 2 }} />
                    <Typography variant="h6" color="primary">Drop YouTube URLs here</Typography>
                  </Box>
                )}
                <DownloadIcon color="primary" sx={{ fontSize: 56, mb: 2 }} />
                {metaLoading && <CircularProgress sx={{ my: 2 }} />}
                {metaError && <Alert severity="error" sx={{ my: 2 }}>{metaError}</Alert>}
                {meta.thumbnail && (
                  <Card sx={{ width: '100%', mb: 2 }}>
                    <CardMedia
                      component="img"
                      height="180"
                      image={meta.thumbnail}
                      alt={meta.title}
                    />
                    <CardContent>
                      <Typography variant="subtitle1" gutterBottom noWrap>{meta.title}</Typography>
                    </CardContent>
                  </Card>
                )}
                {progress && (
                  <Box width="100%" mb={2}>
                    <Stack spacing={1}>
                      <Typography variant="body2">Downloading: {progress.filename}</Typography>
                      <LinearProgress variant="determinate" value={progress.percent} />
                      <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="caption">{progress.percent.toFixed(1)}%</Typography>
                        <Typography variant="caption">Speed: {formatSpeed(progress.speed)}</Typography>
                        <Typography variant="caption">ETA: {formatETA(progress.eta)}</Typography>
                        <Typography variant="caption">{formatBytes(progress.downloaded_bytes)} / {formatBytes(progress.total_bytes || progress.total_bytes_estimate || 0)}</Typography>
                      </Box>
                    </Stack>
                  </Box>
                )}
                {urls.length > 1 && (
                  <Box width="100%" mb={2}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="subtitle2">Batch Download List:</Typography>
                      <Box>
                        <Button size="small" color="primary" onClick={handlePauseAll} sx={{ mr: 1 }}>Pause All</Button>
                        <Button size="small" color="primary" onClick={handleResumeAll} sx={{ mr: 1 }}>Resume All</Button>
                        <Button size="small" color="error" onClick={handleCancelAll}>Cancel All</Button>
                        <Button size="small" color="secondary" onClick={handleClearBatch} sx={{ ml: 1 }}>Clear All</Button>
                      </Box>
                    </Box>
                    <List sx={{ maxHeight: 180, overflowY: 'auto', bgcolor: 'background.paper', borderRadius: 2, boxShadow: 1 }}>
                      {urls.map((u, i) => {
                        const p = progressMap[u];
                        const isPaused = p && p.status === 'paused';
                        const isDownloading = p && p.status === 'downloading';
                        return (
                          <ListItem key={i} alignItems="flex-start" sx={{ flexDirection: 'column', alignItems: 'stretch', mb: 1, p: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                              <DownloadIcon fontSize="small" sx={{ mr: 1 }} />
                              <Typography variant="body2" sx={{ wordBreak: 'break-all', flex: 1 }}>{u}</Typography>
                              <IconButton size="small" color="error" onClick={() => handleRemoveUrl(u)} disabled={!!p && isDownloading}>
                                <CloseIcon fontSize="small" />
                              </IconButton>
                              {/* Pause/Resume/Cancel controls */}
                              {isDownloading ? (
                                <IconButton size="small" color="primary" onClick={() => handlePause(u)}><PauseIcon /></IconButton>
                              ) : isPaused ? (
                                <IconButton size="small" color="primary" onClick={() => handleResume(u)}><PlayArrowIcon /></IconButton>
                              ) : null}
                              <IconButton size="small" color="error" onClick={() => handleCancel(u)} disabled={!!p && p.status === 'finished'}><CancelIcon /></IconButton>
                            </Box>
                            {p && (
                              <Box sx={{ width: '100%', mt: 0.5 }}>
                                <LinearProgress variant="determinate" value={p.percent || 0} />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                                  <Chip size="small" label={p.status === 'finished' ? 'Done' : p.status === 'error' ? 'Error' : p.status} color={p.status === 'finished' ? 'success' : p.status === 'error' ? 'error' : 'primary'} />
                                  <Typography variant="caption">{p.filename || ''}</Typography>
                                  <Typography variant="caption">{p.percent?.toFixed(1) || 0}%</Typography>
                                </Box>
                                {p.status === 'error' && (
                                  <Typography variant="caption" color="error.main">{p.error || 'Download failed.'}</Typography>
                                )}
                              </Box>
                            )}
                          </ListItem>
                        );
                      })}
                    </List>
                    <Typography variant="caption" sx={{ mt: 1, display: 'block', textAlign: 'right' }}>
                      {Object.values(progressMap).filter(p => p && p.status === 'finished').length} of {urls.length} downloads complete
                    </Typography>
                  </Box>
                )}
                <Box
                  component="form"
                  id="download-form"
                  onSubmit={handleSubmit}
                  sx={{
                    width: '100%',
                    mt: 2,
                    px: { xs: 1, sm: 2 },
                    py: { xs: 2, sm: 3 },
                    borderRadius: 3,
                    background: 'rgba(255,255,255,0.7)',
                    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.10)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.25)',
                    transition: 'box-shadow 0.2s',
                    '&:hover': {
                      boxShadow: '0 12px 40px 0 rgba(31, 38, 135, 0.18)',
                    },
                  }}
                >
                  <Stack spacing={3}>
                    <TextField
                      label="YouTube Video URL(s)"
                      variant="outlined"
                      fullWidth
                      required
                      multiline
                      minRows={2}
                      value={urlInput}
                      onChange={e => setUrlInput(e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <DownloadIcon color="action" />
                          </InputAdornment>
                        ),
                      }}
                      helperText="Paste one or more URLs, separated by newlines, commas, or spaces."
                      sx={{
                        background: 'rgba(255,255,255,0.85)',
                        borderRadius: 2,
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': {
                            borderColor: 'rgba(0,0,0,0.08)',
                          },
                          '&:hover fieldset': {
                            borderColor: 'primary.main',
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: 'primary.main',
                            boxShadow: '0 0 0 2px rgba(33,150,243,0.08)',
                          },
                        },
                      }}
                    />
                    <TextField
                      label="Download Directory"
                      variant="outlined"
                      fullWidth
                      required={isElectron}
                      value={downloadDir}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <FolderIcon color="action" />
                          </InputAdornment>
                        ),
                        endAdornment: isElectron ? (
                          <InputAdornment position="end">
                            <Button onClick={handleSelectFolder} variant="outlined" size="small">
                              Choose
                            </Button>
                          </InputAdornment>
                        ) : null,
                        readOnly: true,
                      }}
                      helperText={
                        isElectron
                          ? "Select a folder to save the video"
                          : "Downloads will be saved to your browser’s default Downloads folder"
                      }
                      onClick={isElectron ? handleSelectFolder : undefined}
                      sx={{
                        background: 'rgba(255,255,255,0.85)',
                        borderRadius: 2,
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': {
                            borderColor: 'rgba(0,0,0,0.08)',
                          },
                          '&:hover fieldset': {
                            borderColor: 'primary.main',
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: 'primary.main',
                            boxShadow: '0 0 0 2px rgba(33,150,243,0.08)',
                          },
                        },
                      }}
                    />
                    <Button
                      type="submit"
                      variant="contained"
                      color="primary"
                      size="large"
                      startIcon={<DownloadIcon />}
                      disabled={loading || !downloadDir}
                      fullWidth
                      sx={{
                        py: 1.5,
                        fontWeight: 600,
                        fontSize: '1.1rem',
                        borderRadius: 2,
                        boxShadow: '0 2px 8px 0 rgba(33,150,243,0.08)',
                        transition: 'box-shadow 0.2s',
                        '&:hover': {
                          boxShadow: '0 4px 16px 0 rgba(33,150,243,0.16)',
                        },
                      }}
                    >
                      {loading ? <CircularProgress size={24} color="inherit" /> : 'Download'}
                    </Button>
                  </Stack>
                </Box>
                {message && <Alert severity="success" sx={{ mt: 3, width: '100%' }}>{message}</Alert>}
                {error && <Alert severity="error" sx={{ mt: 3, width: '100%' }}>{error}</Alert>}
              </Card>
            </Box>
            <Snackbar open={snackbar.open} autoHideDuration={2000} onClose={() => setSnackbar({ open: false, message: '' })} message={snackbar.message} />
          </Container>
        </Box>
              {/* Download Modal */}
      <Dialog
        open={downloadModal.open}
        onClose={() => setDownloadModal({ open: false, video: null })}
        maxWidth="md"
        fullWidth
        sx={{
          '& .MuiDialog-paper': {
            margin: { xs: 2, sm: 4 },
            maxHeight: { xs: 'calc(100% - 32px)', sm: 'calc(100% - 64px)' },
          }
        }}
        PaperProps={{
          sx: {
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            borderRadius: { xs: '12px', sm: '16px' },
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
            transform: downloadModal.open ? 'scale(1)' : 'scale(0.9)',
            opacity: downloadModal.open ? 1 : 0,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            width: { xs: '100%', sm: 'auto' },
            maxWidth: { xs: '100%', sm: '600px' },
          }
        }}
        BackdropProps={{
          sx: {
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(4px)',
          }
        }}
      >
        <DialogTitle sx={{ 
          textAlign: 'center', 
          pb: 1,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          borderRadius: { xs: '12px 12px 0 0', sm: '16px 16px 0 0' }
        }}>
          <Typography variant="h5" component="div" sx={{ fontWeight: 600, fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
            🎬 Video Ready!
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          {downloadModal.video && (
            <Box sx={{ textAlign: 'center' }}>
                             {/* Video Thumbnail/Preview */}
               <Box sx={{ 
                 position: 'relative', 
                 maxWidth: { xs: '100%', sm: 500 }, 
                 mx: 'auto', 
                 mb: 3,
                 borderRadius: { xs: '8px', sm: '12px' },
                 overflow: 'hidden',
                 boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                 transform: downloadModal.open ? 'scale(1)' : 'scale(0.95)',
                 opacity: downloadModal.open ? 1 : 0,
                 transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.1s'
               }}>
                 {videoMetadata && videoMetadata.thumbnail ? (
                   <img 
                     src={videoMetadata.thumbnail}
                     alt={downloadModal.video.title}
                     style={{ 
                       width: "100%", 
                       height: isMobile ? "200px" : "280px",
                       objectFit: "cover",
                       borderRadius: isMobile ? "8px" : "12px"
                     }}
                   />
                 ) : downloadModal.video.thumbnail ? (
                   <img 
                     src={downloadModal.video.thumbnail}
                     alt={downloadModal.video.title}
                     style={{ 
                       width: "100%", 
                       height: isMobile ? "200px" : "280px",
                       objectFit: "cover",
                       borderRadius: isMobile ? "8px" : "12px"
                     }}
                   />
                 ) : (
                   <Box sx={{
                     width: "100%",
                     height: isMobile ? "200px" : "280px",
                     background: `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,
                     display: 'flex',
                     alignItems: 'center',
                     justifyContent: 'center',
                     borderRadius: isMobile ? '8px' : '12px'
                   }}>
                     <Typography variant="h4" color="white">
                       🎥
                     </Typography>
                   </Box>
                 )}
                 {/* Play button overlay */}
                 <Box sx={{
                   position: 'absolute',
                   top: '50%',
                   left: '50%',
                   transform: 'translate(-50%, -50%)',
                   background: 'rgba(0, 0, 0, 0.7)',
                   borderRadius: '50%',
                   width: 60,
                   height: 60,
                   display: 'flex',
                   alignItems: 'center',
                   justifyContent: 'center',
                   opacity: 0.8,
                   transition: 'all 0.2s ease'
                 }}>
                   <Typography variant="h4" color="white">
                     ▶️
                   </Typography>
                 </Box>
               </Box>

              {/* Video Info */}
              <Box sx={{ 
                mb: 3,
                transform: downloadModal.open ? 'translateY(0)' : 'translateY(20px)',
                opacity: downloadModal.open ? 1 : 0,
                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.2s'
              }}>
                <Typography variant="h6" component="div" gutterBottom sx={{ fontWeight: 600, color: '#333' }}>
                  {downloadModal.video.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  📁 {downloadModal.video.filename.split('/').pop().replace(/\.f\d+/, '')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  ⏰ Downloaded on {new Date(downloadModal.video.date).toLocaleString()}
                </Typography>
              </Box>

              {/* Download Message */}
              <Typography variant="body1" sx={{ 
                mb: 3, 
                color: '#666',
                transform: downloadModal.open ? 'translateY(0)' : 'translateY(20px)',
                opacity: downloadModal.open ? 1 : 0,
                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.3s'
              }}>
                ✨ Your video is ready! Click the button below to save it to your Downloads folder.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ 
          p: 3, 
          justifyContent: 'center',
          gap: 2,
          transform: downloadModal.open ? 'translateY(0)' : 'translateY(20px)',
          opacity: downloadModal.open ? 1 : 0,
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.4s'
        }}>
          <Button
            onClick={() => setDownloadModal({ open: false, video: null })}
            color="inherit"
            variant="outlined"
            sx={{ 
              borderRadius: '8px',
              px: 3,
              py: 1.5
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => handleDownloadFromModal(downloadModal.video)}
            variant="contained"
            color="primary"
            startIcon={<DownloadIcon />}
            size="large"
            sx={{ 
              borderRadius: '8px',
              px: 4,
              py: 1.5,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
              '&:hover': {
                background: 'linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%)',
                boxShadow: '0 6px 20px rgba(102, 126, 234, 0.6)',
                transform: 'translateY(-2px)'
              },
              transition: 'all 0.3s ease'
            }}
          >
            Download Now
          </Button>
        </DialogActions>
      </Dialog>
      </Box>
    </ThemeProvider>
  );
}

export default App;
