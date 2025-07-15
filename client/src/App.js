import React, { useState, useEffect, useRef } from 'react';
import {
  AppBar, Toolbar, IconButton, Typography, Container, Box, TextField, Button, Alert, CircularProgress, Paper, InputAdornment, Card, CardMedia, CardContent, LinearProgress, Stack, Drawer, List, ListItem, ListItemAvatar, Avatar, ListItemText, Divider, useMediaQuery, Tooltip
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import FolderIcon from '@mui/icons-material/Folder';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import CloseIcon from '@mui/icons-material/Close';
import { useTheme } from '@mui/material/styles';

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
const SIDEBAR_WIDTH = 300;
const SIDEBAR_WIDTH_MOBILE = 200;
const SIDEBAR_COLLAPSED = 56;

function App() {
  const [url, setUrl] = useState('');
  const [downloadDir, setDownloadDir] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState({ title: '', thumbnail: '' });
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [history, setHistory] = useState([]);
  const wsRef = useRef(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isMdUp = useMediaQuery(theme.breakpoints.up('md'));
  const [sidebarOpen, setSidebarOpen] = useState(isMdUp);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);

  // Update sidebar state on screen size change
  useEffect(() => {
    setSidebarOpen(isMdUp);
  }, [isMdUp]);

  // Load history from localStorage
  useEffect(() => {
    const h = localStorage.getItem(HISTORY_KEY);
    if (h) setHistory(JSON.parse(h));
  }, []);

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (!url) {
      setMeta({ title: '', thumbnail: '' });
      setMetaError(null);
      return;
    }
    // Only fetch if looks like a YouTube URL
    if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url)) {
      setMeta({ title: '', thumbnail: '' });
      setMetaError(null);
      return;
    }
    setMetaLoading(true);
    setMetaError(null);
    fetch('http://localhost:8000/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
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
  }, [url]);

  // WebSocket for progress
  useEffect(() => {
    if (wsRef.current) return; // Only connect once
    const ws = new window.WebSocket('ws://127.0.0.1:8000/ws/progress');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.status === 'downloading') {
        setProgress(data);
      } else if (data.status === 'finished') {
        setProgress(null);
      }
    };
    wsRef.current = ws;
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  const handleSelectFolder = async () => {
    if (window.electronAPI && window.electronAPI.selectFolder) {
      const folder = await window.electronAPI.selectFolder();
      if (folder) setDownloadDir(folder);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    setProgress(null);
    try {
      const response = await fetch('http://localhost:8000/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, download_dir: downloadDir })
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(data.message);
        // Add to history
        setHistory(prev => [{
          title: meta.title,
          thumbnail: meta.thumbnail,
          url,
          downloadDir,
          date: new Date().toISOString(),
          status: 'Completed',
          filename: data.message && progress && progress.filename ? progress.filename : '',
        }, ...prev]);
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

  // Sidebar content
  const sidebarContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 1, mt: 5, display: 'flex', alignItems: 'center', justifyContent: sidebarOpen || isMobile ? 'space-between' : 'center' }}>
        {(sidebarOpen || isMobile) ? (
          <Typography
            variant="h6"
            sx={{
              ml: 1,
              textAlign: { xs: 'left', md: 'center' },
              width: '100%',
            }}
          >
            Download History
          </Typography>
        ) : null}
        {/* Remove toggle button from inside sidebar for mobile */}
        {!isMobile && (
          <IconButton onClick={handleToggleSidebar} size="small">
            {sidebarOpen ? <ChevronLeftIcon /> : <MenuIcon />}
          </IconButton>
        )}
      </Box>
      {(sidebarOpen || isMobile) && (
        <Button size="small" onClick={handleClearHistory} sx={{ mx: 2, mb: 1 }}>Clear</Button>
      )}
      <Divider />
      <List sx={{ flex: 1, overflowY: 'auto' }}>
        {history.length === 0 && <ListItem>{(sidebarOpen || isMobile) ? <ListItemText primary="No downloads yet." /> : <DownloadIcon />}</ListItem>}
        {history.map((item, idx) => (
          <Tooltip key={idx} title={(sidebarOpen || isMobile) ? '' : item.title} placement="right">
            <ListItem alignItems="flex-start" secondaryAction={
              item.filename && (
                <IconButton edge="end" aria-label="open" onClick={() => handleOpenFile(item)}>
                  <OpenInNewIcon />
                </IconButton>
              )
            }>
              <ListItemAvatar>
                <Avatar variant="rounded" src={item.thumbnail} alt={item.title} />
              </ListItemAvatar>
              {(sidebarOpen || isMobile) && (
                <ListItemText
                  primary={item.title}
                  secondary={
                    <>
                      <Typography component="span" variant="caption" color="text.secondary">
                        {new Date(item.date).toLocaleString()}<br />
                        {item.status}
                      </Typography>
                    </>
                  }
                />
              )}
            </ListItem>
          </Tooltip>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', width: '100vw', flexDirection: 'column' }}>
      {/* AppBar for mobile toggle */}
      <AppBar
        position="static"
        color="transparent"
        elevation={0}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          background: 'transparent',
          boxShadow: 'none',
          position: 'relative',
        }}
      >
        <Toolbar sx={{ position: 'relative', minHeight: 64 }}>
          {/* Sidebar toggle for mobile */}
          {isMobile && !sidebarMobileOpen && (
            <IconButton
              edge="start"
              color="inherit"
              aria-label="open sidebar"
              onClick={() => handleToggleSidebar(false, true)}
              sx={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }}
            >
              <MenuIcon />
            </IconButton>
          )}
          {isMobile && sidebarMobileOpen && (
            <IconButton
              edge="start"
              color="inherit"
              aria-label="close sidebar"
              onClick={() => handleToggleSidebar(true)}
              sx={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }}
            >
              <CloseIcon />
            </IconButton>
          )}
          <Typography
            variant="h4"
            sx={{
              fontWeight: 600,
              textAlign: 'center',
              width: '100%',
              position: 'absolute',
              left: 0,
              right: 0,
              pointerEvents: 'none',
              fontSize: { xs: '1.2rem', sm: '1.5rem', md: '2rem' },
              lineHeight: 1.2,
            }}
          >
            YouTube Video Downloader
          </Typography>
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
        {/* Main Content */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            width: 0,
            p: { xs: 1, sm: 2, md: 4 },
            background: { xs: '#fff', sm: '#f9f9f9' },
            overflowX: 'hidden',
          }}
        >
          <Container
            maxWidth={false}
            disableGutters
            sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}
          >
            <Paper
              elevation={3}
              sx={{
                p: { xs: 2, sm: 3, md: 4 },
                width: '100%',
                maxWidth: 500,
                my: { xs: 2, sm: 4 },
                mx: 'auto',
              }}
            >
              <Box display="flex" flexDirection="column" alignItems="center" textAlign="center" gap={2}>
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
                        <Typography variant="caption">{formatBytes(progress.downloaded_bytes)} / {formatBytes(progress.total_bytes)}</Typography>
                      </Box>
                    </Stack>
                  </Box>
                )}
                <form onSubmit={handleSubmit} style={{ width: '100%' }}>
                  <TextField
                    label="YouTube Video URL"
                    variant="outlined"
                    fullWidth
                    required
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    margin="normal"
                    InputProps={{ startAdornment: <DownloadIcon color="action" sx={{ mr: 1 }} /> }}
                  />
                  <TextField
                    label="Download Directory"
                    variant="outlined"
                    fullWidth
                    required
                    value={downloadDir}
                    margin="normal"
                    InputProps={{
                      startAdornment: <FolderIcon color="action" sx={{ mr: 1 }} />,
                      endAdornment: (
                        <InputAdornment position="end">
                          <Button onClick={handleSelectFolder} variant="outlined" size="small" sx={{ pr: { xs: 0.5, sm: 0 } }}>Choose</Button>
                        </InputAdornment>
                      )
                    }}
                    helperText="Select a folder to save the video"
                    onClick={handleSelectFolder}
                    readOnly
                  />
                  <Box mt={2} display="flex" justifyContent="center">
                    <Button
                      type="submit"
                      variant="contained"
                      color="primary"
                      size="large"
                      startIcon={<DownloadIcon />}
                      disabled={loading || !downloadDir}
                      fullWidth
                    >
                      {loading ? <CircularProgress size={24} color="inherit" /> : 'Download'}
                    </Button>
                  </Box>
                </form>
                {message && <Alert severity="success" sx={{ mt: 2, width: '100%' }}>{message}</Alert>}
                {error && <Alert severity="error" sx={{ mt: 2, width: '100%' }}>{error}</Alert>}
              </Box>
            </Paper>
          </Container>
        </Box>
      </Box>
    </Box>
  );
}

export default App; 
