import React from 'react';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from '../LoadingSpinner';

describe('LoadingSpinner', () => {
  it('should render with default message', () => {
    render(<LoadingSpinner />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should render with custom message', () => {
    render(<LoadingSpinner message="Loading data..." />);
    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('should display a spinner animation', () => {
    const { container } = render(<LoadingSpinner />);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should have proper styling classes', () => {
    const { container } = render(<LoadingSpinner />);
    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass('flex', 'items-center', 'justify-center');
  });
});
