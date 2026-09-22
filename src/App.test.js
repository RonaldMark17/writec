import { render, screen, act } from '@testing-library/react';
import App from './App';

test('renders the WriteCheck landing page', async () => {
  await act(async () => {
    render(<App />);
  });

  expect(
    screen.getByRole('heading', {
      name: /detect plagiarism in handwritten essays/i,
    })
  ).toBeInTheDocument();
});
